import bcrypt from "bcryptjs";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("=== GENERADOR DE HASH PARA PORTAL MDA ===");

rl.question("Ingresa la contraseña que deseas hashear: ", (password) => {
  if (!password) {
    console.log("Error: No ingresaste ninguna contraseña.");
    rl.close();
    return;
  }

  const saltRounds = 10;
  const hash = bcrypt.hashSync(password, saltRounds);

  console.log("\n--------------------------------------------------");
  console.log("Contraseña ingresada:", password);
  console.log("HASH RESULTANTE (Copia esto en la DB):");
  console.log(hash);
  console.log("--------------------------------------------------\n");

  rl.close();
});
