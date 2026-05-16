import bcrypt from "bcryptjs";
import readline from "readline";

// Configuramos la interfaz de lectura por terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("=== GENERADOR DE HASH PARA PORTAL MDA ===");

// Pedimos la contraseña al usuario
rl.question("Ingresa la contraseña que deseas hashear: ", (password) => {
  if (!password) {
    console.log("Error: No ingresaste ninguna contraseña.");
    rl.close();
    return;
  }

  // Generamos el hash
  const saltRounds = 10;
  const hash = bcrypt.hashSync(password, saltRounds);

  console.log("\n--------------------------------------------------");
  console.log("Contraseña ingresada:", password);
  console.log("HASH RESULTANTE (Copia esto en la DB):");
  console.log(hash);
  console.log("--------------------------------------------------\n");

  rl.close();
});
