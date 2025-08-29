const bcrypt = require('bcrypt');

const plainTextPassword = 'Notemasquejudas123#'; // <-- CAMBIA ESTO
const saltRounds = 10;

bcrypt.hash(plainTextPassword, saltRounds, function(err, hash) {
    if (err) {
        console.error('Error al encriptar la contraseña:', err);
        return;
    }
    console.log('--- Tu Contraseña Encriptada (Hash) ---');
    console.log('Copia y pega esto en el campo "password" de tu base de datos:');
    console.log(hash);
});