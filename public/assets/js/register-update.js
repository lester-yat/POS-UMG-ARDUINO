// Example starter JavaScript for disabling form submissions if there are invalid fields
(() => {
  'use strict'

  // Fetch all the forms we want to apply custom Bootstrap validation styles to
  const forms = document.querySelectorAll('.needs-validation')

  // Loop over them and prevent submission
  Array.from(forms).forEach(form => {
    form.addEventListener('submit', event => {
      if (!form.checkValidity()) {
        event.preventDefault()
        event.stopPropagation()
      }

      form.classList.add('was-validated')
    }, false)
  })
})()

// Función para formatear el número de tarjeta
function formatCardNumber(input) {
  // Convertir todas las letras a mayúsculas
  input.value = input.value.toUpperCase();

  // Eliminar espacios en blanco y guiones (si los hay)
  let cardNumber = input.value.replace(/[\s-]/g, '');

  // Insertar un espacio cada dos dígitos
  cardNumber = cardNumber.replace(/(.{2})/g, '$1 ').trim(); // Insertar espacio cada 4 caracteres

  // Asignar el valor formateado al campo de entrada
  input.value = cardNumber;
}