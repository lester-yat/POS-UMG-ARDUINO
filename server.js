const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const app = express();

app.use(session({
  secret: 'mysecret',
  resave: true,
  saveUninitialized: true
}));

app.use(flash());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const mysql = require('mysql');

const portMonitor = new SerialPort('COM5', { baudRate: 9600 });
const parser = portMonitor.pipe(new ReadlineParser({ delimiter: '\r\n' }));

let receivedData = '';
let expectingUID = true;
let UID = '';

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'rootpass',
  database: 'banca_en_linea'
});

connection.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    return;
  }
  console.log('Conexión exitosa a la base de datos MySQL');
});

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: true }));

module.exports = app;

app.get('/', (req, res) => {
  res.render('dashboard');
});

app.get('/login', (req, res) => {
  res.render('login', { messages: { success: req.flash('success'), error: req.flash('error') } });
});

app.get('/registro', (req, res) => {
  res.render('registro', { messages: { success: req.flash('success'), error: req.flash('error') } });
});

app.get('/dashboard', (req, res) => {
  const clientsQuery = 'SELECT * FROM clientes';
  connection.query(clientsQuery, (err, clients) => {
    if (err) {
      console.error('Error al obtener los datos de clientes:', err);
      return res.status(500).send('Error interno del servidor');
    }

    const movementsQuery = 'SELECT nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento FROM movimientos ORDER BY id ASC';
    connection.query(movementsQuery, (err, movements) => {
      if (err) {
        console.error('Error al obtener los datos de movimientos:', err);
        return res.status(500).send('Error interno del servidor');
      }

      res.render('dashboard', { clients, movements, messages: { success: req.flash('success'), error: req.flash('error') } });
    });
  });
});

app.get('/registro-usuario', (req, res) => {
  res.render('usuario');
});

app.get('/actualizar/:id', (req, res) => {
  const clientId = req.params.id;

  const clientQuery = 'SELECT * FROM clientes WHERE id = ?';
  connection.query(clientQuery, [clientId], (err, client) => {
      if (err) {
          console.error('Error al obtener los datos del cliente:', err);
          return res.status(500).send('Error interno del servidor');
      }

      if (client.length === 0) {
          return res.status(404).send('Cliente no encontrado');
      }
      
      res.render('actualizacion', { client: client[0] });
  });
});

app.delete('/eliminar/:id', (req, res) => {
  const clientId = req.params.id;

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

    const deleteMovementsQuery = 'DELETE FROM movimientos WHERE UID_Card = ?';
    connection.query(deleteMovementsQuery, [UID_Card], (err, results) => {
      if (err) {
        console.error('Error al eliminar movimientos:', err);
        return res.status(500).send('Error interno del servidor');
      }

      const deleteClientQuery = 'DELETE FROM clientes WHERE id = ?';
      connection.query(deleteClientQuery, [clientId], (err, results) => {
        if (err) {
          console.error('Error al eliminar cliente:', err);
          return res.status(500).send('Error interno del servidor');
        }

        res.sendStatus(200);
      });
    });
  });
});

app.post('/actualizar-tarjeta', (req, res) => {
  const { nombres, apellidos, saldo, fecha_registro, numero_tarjeta } = req.body;

  const balanceQuery = `SELECT Balance FROM clientes WHERE UID_Card = ?`;
  connection.query(balanceQuery, [numero_tarjeta], (err, balanceResult) => {
    if (err) {
      console.error('Error al consultar el saldo del cliente:', err);
      return res.status(500).send('Error interno del servidor');
    }

    if (balanceResult.length === 0) {
      console.error('No se encontró ningún cliente con el UID especificado');
      return res.status(404).send('Cliente no encontrado');
    }

    const saldoActual = balanceResult[0].Balance;

    const nuevoSaldo = parseFloat(saldoActual) + parseFloat(saldo);

    const updateClientQuery = `UPDATE clientes SET Balance = ? WHERE UID_Card = ?`;
    connection.query(updateClientQuery, [nuevoSaldo, numero_tarjeta], (err, updateResult) => {
      if (err) {
        console.error('Error al actualizar el saldo del cliente:', err);
        return res.status(500).send('Error interno del servidor');
      }

      const insertQuery = `INSERT INTO movimientos (nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento) VALUES (?, ?, ?, ?, ?)`;
      connection.query(insertQuery, [nombres + ' ' + apellidos, numero_tarjeta, saldo, fecha_registro, '1'], (err, insertResult) => {
        if (err) {
          console.error('Error al insertar el movimiento:', err);
          return res.status(500).send('Error interno del servidor');
        }

        res.redirect('/dashboard');
      });
    });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

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

app.post('/registro-usuario', (req, res) => {
  const { first_name, last_name, email, password } = req.body;

  const checkQuery = `SELECT * FROM usuarios WHERE email = ?`;
  connection.query(checkQuery, [email], (err, results) => {
      if (err) {
          console.error('Error al verificar el correo electrónico:', err);
          return res.status(500).send('Error interno del servidor');
      }

      if (results.length > 0) {
          return res.status(409).send('El correo electrónico ya está en uso');
      }

      const insertQuery = `INSERT INTO usuarios (first_name, last_name, email, password) VALUES (?, ?, ?, ?)`;
      connection.query(insertQuery, [first_name, last_name, email, password], (err, result) => {
          if (err) {
              console.error('Error al registrar el usuario:', err);
              return res.status(500).send('Error interno del servidor');
          }

          res.redirect('/login');
      });
  });
});

portMonitor.on('data', (data) => {
  const textData = data.toString();

  receivedData += textData;

  const newlineIndex = receivedData.lastIndexOf('\n');

  if (newlineIndex !== -1) {
    const line = receivedData.substring(0, newlineIndex);
    receivedData = receivedData.substring(newlineIndex + 1);

    let monto = 0;

    if (expectingUID) {
      const uidMatch = line.match(/([0-9a-fA-F ]{11})/);
      if (uidMatch) {
        UID = uidMatch[1].replace(/ /g, ' ');
        console.log(`${UID}`);
        expectingUID = false;
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
            currentClientName = 'Desconocido';
            const insertQuery = `INSERT INTO movimientos (nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento) VALUES (?, ?, ?, ?, ?)`;
            const fechaRegistro = new Date().toISOString().slice(0, 19).replace('T', ' ');
            connection.query(insertQuery, [currentClientName, UID, monto, fechaRegistro, tipoMovimiento], (err, insertResult) => {
              if (err) {
                console.error('Error al insertar el movimiento:', err);
                return;
              }
              console.log(insertResult);
              portMonitor.write('Tarjeta Rechazada\n');
            });
          }
        });
      }
    } else {
      const montoMatch = line.match(/(\d+)/);
      if (montoMatch) {
        monto = parseInt(montoMatch[1]);
        console.log(`${monto}`);
        expectingUID = true;

        const balanceQuery = `SELECT Balance FROM clientes WHERE UID_Card = "${UID}"`;
        connection.query(balanceQuery, (err, balanceResult) => {
          if (err) {
            console.error('Error al consultar el balance del cliente:', err);
            return;
          }

          if (balanceResult.length > 0) {
            const balance = balanceResult[0].Balance;
            if (monto > balance) {
              const insertQuery = `INSERT INTO movimientos (nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento) VALUES (?, ?, ?, ?, ?)`;
              const fechaRegistro = new Date().toISOString().slice(0, 19).replace('T', ' ');
              const tipoMovimiento = 4;
              connection.query(insertQuery, [currentClientName, UID, monto, fechaRegistro, tipoMovimiento], (err, insertResult) => {
                if (err) {
                  console.error('Error al insertar el movimiento:', err);
                  return;
                }
                console.log(insertResult);
                portMonitor.write('Dinero Insuficiente\n');
              });
            } else {
              const updateQuery = `UPDATE clientes SET Balance = Balance - ${monto} WHERE UID_Card = "${UID}"`;
              connection.query(updateQuery, (err, updateResult) => {
                if (err) {
                  console.error('Error al actualizar el balance del cliente:', err);
                  return;
                }
                console.log(updateResult);

                const insertQuery = `INSERT INTO movimientos (nombre_tarjeta, UID_Card, saldo_movimiento, fecha_registro, tipo_movimiento) VALUES (?, ?, ?, ?, ?)`;
                const fechaRegistro = new Date().toISOString().slice(0, 19).replace('T', ' ');
                const tipoMovimiento = 2;
                connection.query(insertQuery, [currentClientName, UID, monto, fechaRegistro, tipoMovimiento], (err, insertResult) => {
                  if (err) {
                    console.error('Error al insertar el movimiento:', err);
                    return;
                  }
                  console.log(insertResult);
                  portMonitor.write('Transaccion Exitosa\n');
                });
              });
            }
          }
        });
      }
    }
  }
});

process.on('exit', () => {
  connection.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
app.use('/public', express.static(path.join(__dirname, 'public')));
