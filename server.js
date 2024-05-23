const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

const app = express();

app.use(session({
  secret: 'mysecret',
  resave: true,
  saveUninitialized: true
}));

app.use(flash());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Importar módulos existentes
const { SerialPort } = require('serialport');
const mysql = require('mysql');

// Definir el puerto serial y la velocidad de baudios
const port = new SerialPort('COM5', { baudRate: 9600 });

let receivedData = ''; // Buffer para almacenar los datos recibidos
let expectingUID = true; // Estado inicial: esperando UID
let UID = ''; // Variable para almacenar el UID actual

// Configuración de la conexión a la base de datos MySQL
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'rootpass',
  database: 'banca_en_linea'
});

// Conectar a la base de datos
connection.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    return;
  }
  console.log('Conexión exitosa a la base de datos MySQL');
});

// Configurar el motor de plantillas EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware para manejar solicitudes POST
app.use(express.urlencoded({ extended: true }));

// Ruta para la página de inicio
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta y controlador para la página de inicio de sesión
app.get('/login', (req, res) => {
  res.render('login', { messages: { success: req.flash('success'), error: req.flash('error') } });
});

// Ruta y controlador para el formulario de registro
app.get('/registro', (req, res) => {
  res.render('registro', { messages: { success: req.flash('success'), error: req.flash('error') } });
});

// Ruta y controlador para el dashboard
app.get('/dashboard', (req, res) => {
  // Consulta para obtener los datos de la tabla clientes
  const clientsQuery = 'SELECT * FROM clientes';
  connection.query(clientsQuery, (err, clients) => {
    if (err) {
      console.error('Error al obtener los datos de clientes:', err);
      return res.status(500).send('Error interno del servidor');
    }

    // Consulta para obtener los datos de la tabla movimientos
    const movementsQuery = 'SELECT nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento FROM movimientos ORDER BY id ASC';
    connection.query(movementsQuery, (err, movements) => {
      if (err) {
        console.error('Error al obtener los datos de movimientos:', err);
        return res.status(500).send('Error interno del servidor');
      }

      // Renderiza la plantilla EJS del dashboard con los datos obtenidos
      res.render('dashboard', { clients, movements, messages: { success: req.flash('success'), error: req.flash('error') } });
    });
  });
});

// Ruta y controlador para el formulario de registro de usuario
app.get('/registro-usuario', (req, res) => {
  res.render('usuario');
});

// Ruta y controlador para la página de actualización
app.get('/actualizar/:id', (req, res) => {
  const clientId = req.params.id;

  // Consultar la información del cliente basada en el ID recibido
  const clientQuery = 'SELECT * FROM clientes WHERE id = ?';
  connection.query(clientQuery, [clientId], (err, client) => {
      if (err) {
          console.error('Error al obtener los datos del cliente:', err);
          return res.status(500).send('Error interno del servidor');
      }

      // Verificar si se encontró un cliente con el ID especificado
      if (client.length === 0) {
          // Si no se encontró ningún cliente, devolver un error 404
          return res.status(404).send('Cliente no encontrado');
      }

      // Renderizar la página de actualización con los datos del cliente
      res.render('actualizacion', { client: client[0] });
  });
});

// Controlador para eliminar un cliente y sus movimientos asociados
app.delete('/eliminar/:id', (req, res) => {
  const clientId = req.params.id;

  // Primero, obtener el UID_Card del cliente
  const getUIDQuery = 'SELECT UID_Card FROM clientes WHERE id = ?';
  connection.query(getUIDQuery, [clientId], (err, results) => {
    if (err) {
      console.error('Error al obtener UID_Card del cliente:', err);
      return res.status(500).send('Error interno del servidor');
    }

    if (results.length === 0) {
      return res.status(404).send('Cliente no encontrado');
    }

    const UID_Card = results[0].UID_Card;

    // Eliminar los movimientos asociados al UID_Card
    const deleteMovementsQuery = 'DELETE FROM movimientos WHERE UID_Card = ?';
    connection.query(deleteMovementsQuery, [UID_Card], (err, results) => {
      if (err) {
        console.error('Error al eliminar movimientos:', err);
        return res.status(500).send('Error interno del servidor');
      }

      // Eliminar el cliente
      const deleteClientQuery = 'DELETE FROM clientes WHERE id = ?';
      connection.query(deleteClientQuery, [clientId], (err, results) => {
        if (err) {
          console.error('Error al eliminar cliente:', err);
          return res.status(500).send('Error interno del servidor');
        }

        // Responder con éxito después de la eliminación
        res.sendStatus(200);
      });
    });
  });
});

// Controlador para manejar la solicitud POST de actualización de tarjeta
app.post('/actualizar-tarjeta', (req, res) => {
  const { nombres, apellidos, saldo, fecha_registro, numero_tarjeta } = req.body;

  // Consultar el saldo actual del cliente en la base de datos
  const balanceQuery = `SELECT Balance FROM clientes WHERE UID_Card = ?`;
  connection.query(balanceQuery, [numero_tarjeta], (err, balanceResult) => {
    if (err) {
      console.error('Error al consultar el saldo del cliente:', err);
      return res.status(500).send('Error interno del servidor');
    }

    // Verificar si se encontró el cliente
    if (balanceResult.length === 0) {
      console.error('No se encontró ningún cliente con el UID especificado');
      return res.status(404).send('Cliente no encontrado');
    }

    // Obtener el saldo actual del cliente
    const saldoActual = balanceResult[0].Balance;

    // Calcular el nuevo saldo sumando el saldo actual con el saldo ingresado en el formulario
    const nuevoSaldo = parseFloat(saldoActual) + parseFloat(saldo);

    // Actualizar el saldo en la tabla de clientes
    const updateClientQuery = `UPDATE clientes SET Balance = ? WHERE UID_Card = ?`;
    connection.query(updateClientQuery, [nuevoSaldo, numero_tarjeta], (err, updateResult) => {
      if (err) {
        console.error('Error al actualizar el saldo del cliente:', err);
        return res.status(500).send('Error interno del servidor');
      }

      // Insertar la información de la actualización en la tabla de movimientos
      const insertQuery = `INSERT INTO movimientos (nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento) VALUES (?, ?, ?, ?, ?)`;
      connection.query(insertQuery, [nombres + ' ' + apellidos, numero_tarjeta, saldo, fecha_registro, '1'], (err, insertResult) => {
        if (err) {
          console.error('Error al insertar el movimiento:', err);
          return res.status(500).send('Error interno del servidor');
        }

        // Redireccionar al dashboard después de la actualización
        res.redirect('/dashboard');
      });
    });
  });
});

// Controlador para manejar la solicitud POST de inicio de sesión
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Verificar las credenciales en la base de datos
  const query = `SELECT * FROM usuarios WHERE email = ? AND password = ?`;
  connection.query(query, [email, password], (err, results) => {
    if (err) {
      console.error('Error al verificar las credenciales:', err);
      req.flash('error', 'Error al verificar las credenciales');
      return res.redirect('/login');
    }

    if (results.length === 0) {
      req.flash('error', 'Correo electrónico o contraseña incorrectos');
      return res.render('login', { messages: { error: req.flash('error') } });
    }

    req.flash('success', 'Inicio de sesión exitoso');
    res.redirect('/dashboard');
  });
});

// Controlador para manejar la solicitud POST de registro desde registro.ejs
app.post('/registro', (req, res) => {
  const { nombres, apellidos, numero_tarjeta, saldo, fecha_registro } = req.body;

  const checkQuery = `SELECT * FROM clientes WHERE UID_Card = ?`;
  connection.query(checkQuery, [numero_tarjeta], (err, results) => {
    if (err) {
      req.flash('error', 'Error al verificar el número de tarjeta');
      return res.redirect('/registro');
    }

    if (results.length > 0) {
      req.flash('error', 'El número de tarjeta ya está en uso');
      return res.redirect('/registro');
    }

    const insertQuery = `INSERT INTO clientes (First_name, Last_name, UID_Card, Balance, fecha_registro) VALUES (?, ?, ?, ?, ?)`;
    connection.query(insertQuery, [nombres, apellidos, numero_tarjeta, saldo, fecha_registro], (err, result) => {
      if (err) {
        req.flash('error', 'Error al registrar el cliente');
        return res.redirect('/registro');
      }

      req.flash('success', 'Cliente registrado exitosamente');
      res.redirect('/dashboard');
    });
  });
});

// Controlador para manejar la solicitud POST de registro de usuario desde usuario.ejs
app.post('/registro-usuario', (req, res) => {
  const { first_name, last_name, email, password } = req.body;

  // Verificar si el correo electrónico ya está en uso
  const checkQuery = `SELECT * FROM usuarios WHERE email = ?`;
  connection.query(checkQuery, [email], (err, results) => {
      if (err) {
          console.error('Error al verificar el correo electrónico:', err);
          return res.status(500).send('Error interno del servidor');
      }

      // Verificar si ya existe un usuario con el mismo correo electrónico
      if (results.length > 0) {
          return res.status(409).send('El correo electrónico ya está en uso');
      }

      // Si el correo electrónico no está en uso, insertar el nuevo usuario en la base de datos
      const insertQuery = `INSERT INTO usuarios (first_name, last_name, email, password) VALUES (?, ?, ?, ?)`;
      connection.query(insertQuery, [first_name, last_name, email, password], (err, result) => {
          if (err) {
              console.error('Error al registrar el usuario:', err);
              return res.status(500).send('Error interno del servidor');
          }

          // Usuario registrado exitosamente
          res.redirect('/login');
      });
  });
});

// Escuchar el evento 'data' para leer los datos del puerto serial
port.on('data', (data) => {
  // Convertir los datos a texto
  const textData = data.toString();

  // Agregar los datos al buffer
  receivedData += textData;

  // Buscar la posición de la última línea terminada en '\n'
  const newlineIndex = receivedData.lastIndexOf('\n');

  // Si se encontró una línea completa
  if (newlineIndex !== -1) {
    // Extraer la línea completa del buffer
    const line = receivedData.substring(0, newlineIndex);
    // Actualizar el buffer con los datos restantes
    receivedData = receivedData.substring(newlineIndex + 1);

    // Variable para almacenar el monto
    let monto = 0; // Asignar un valor predeterminado de 0

    if (expectingUID) {
      // Verificar si la línea sigue el formato esperado para UID
      const uidMatch = line.match(/([0-9a-fA-F ]{11})/);
      if (uidMatch) {
        // Extraer el valor de UID y mostrarlo en pantalla
        UID = uidMatch[1].replace(/ /g, ' ');
        console.log(`${UID}`);
        expectingUID = false; // Cambiar al estado de esperar Monto

        // Verificar si el UID existe en la base de datos
        const query = `SELECT * FROM clientes WHERE UID_Card = "${UID}"`;
        connection.query(query, (err, result) => {
          if (err) {
            console.error('Error al consultar la base de datos:', err);
            return;
          }
          console.log(result);

          if (result.length > 0) {
            const cliente = result[0];
            currentClientName = `${cliente.First_name} ${cliente.Last_name}`;
          } else {
            // Si el UID no existe, registra el movimiento con nombre desconocido
            currentClientName = 'Desconocido';
            const insertQuery = `INSERT INTO movimientos (nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento) VALUES (?, ?, ?, ?, ?)`;
            const fechaRegistro = new Date().toISOString().slice(0, 19).replace('T', ' '); // Obtener la fecha actual
            const tipoMovimiento = 3; // Tipo de movimiento para indicar UID desconocido
            connection.query(insertQuery, [currentClientName, UID, monto, fechaRegistro, tipoMovimiento], (err, insertResult) => {
              if (err) {
                console.error('Error al insertar el movimiento:', err);
                return;
              }
              console.log(insertResult);
            });
          }
        });
      }
    } else {
      // Verificar si la línea sigue el formato esperado para Monto
      const montoMatch = line.match(/(\d+)/);
      if (montoMatch) {
        // Extraer el valor de Monto y mostrarlo en pantalla
        monto = parseInt(montoMatch[1]);
        console.log(`${monto}`);
        expectingUID = true; // Cambiar al estado de esperar UID nuevamente

        // Verificar si el monto excede el balance del cliente
        const balanceQuery = `SELECT Balance FROM clientes WHERE UID_Card = "${UID}"`;
        connection.query(balanceQuery, (err, balanceResult) => {
          if (err) {
            console.error('Error al consultar el balance del cliente:', err);
            return;
          }

          if (balanceResult.length > 0) {
            const balance = balanceResult[0].Balance;
            if (monto > balance) {
              // El monto excede el balance del cliente, registra el movimiento sin modificar el balance
              const insertQuery = `INSERT INTO movimientos (nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento) VALUES (?, ?, ?, ?, ?)`;
              const fechaRegistro = new Date().toISOString().slice(0, 19).replace('T', ' '); // Obtener la fecha actual
              const tipoMovimiento = 4; // Tipo de movimiento para indicar monto excedido
              connection.query(insertQuery, [currentClientName, UID, monto, fechaRegistro, tipoMovimiento], (err, insertResult) => {
                if (err) {
                  console.error('Error al insertar el movimiento:', err);
                  return;
                }
                console.log(insertResult);
              });
            } else {
              // El monto no excede el balance del cliente, procede con la actualización del balance y registro del movimiento
              const updateQuery = `UPDATE clientes SET Balance = Balance - ${monto} WHERE UID_Card = "${UID}"`;
              connection.query(updateQuery, (err, updateResult) => {
                if (err) {
                  console.error('Error al actualizar el balance del cliente:', err);
                  return;
                }
                console.log(updateResult);

                // Insertar el movimiento en la base de datos
                const insertQuery = `INSERT INTO movimientos (nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento) VALUES (?, ?, ?, ?, ?)`;
                const fechaRegistro = new Date().toISOString().slice(0, 19).replace('T', ' '); // Obtener la fecha actual
                const tipoMovimiento = 2; // Tipo de movimiento para indicar ingreso desde el puerto serial
                connection.query(insertQuery, [currentClientName, UID, monto, fechaRegistro, tipoMovimiento], (err, insertResult) => {
                  if (err) {
                    console.error('Error al insertar el movimiento:', err);
                    return;
                  }
                  console.log(insertResult);
                });
              });
            }
          }
        });
      }
    }
  }
});

// Manejar el cierre de la conexión a la base de datos al salir del programa
process.on('exit', () => {
  connection.end();
});

// Definir el puerto en el que escuchará el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
// Servir archivos estáticos desde la carpeta 'public'
app.use('/public', express.static(path.join(__dirname, 'public')));
