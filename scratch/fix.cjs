const fs = require("fs");

const content = fs.readFileSync("src/data/mock_telegrafia.ts", "utf8");

const match = content.match(
  /export const mockTelegrafia: Office\[\] = (\[[\s\S]*\]);/,
);
if (!match) {
  console.error("Could not find array");
  process.exit(1);
}

let arrayStr = match[1];

let offices = eval("(" + arrayStr + ")");

offices.forEach((office) => {
  let newNotes = office.notes ? office.notes + " " : "";
  let newContacts = [];

  office.contacts.forEach((c) => {
    let name = c.name ? c.name.trim() : "";
    let phone = c.phone ? c.phone.trim() : "";
    let timeSlot = c.timeSlot ? c.timeSlot.trim() : "";
    let role = c.role ? c.role.trim() : "";

    if (
      name.toLowerCase().includes("se envia mail") ||
      name.toLowerCase().includes("se envía mail")
    ) {
      newNotes += "Se envió mail solicitando datos. ";
      if (phone) newNotes += phone + " ";
      if (timeSlot) newNotes += timeSlot + " ";
      if (role) newNotes += role + " ";
      return;
    }

    if (
      (name.toLowerCase() === "oficina" ||
        name.toLowerCase() === "sucursal" ||
        name.toLowerCase() === "fijo del cdd") &&
      role === ""
    ) {
      newNotes += `${name} Tel: ${phone} `;
      if (timeSlot) newNotes += `(${timeSlot}) `;
      return;
    }

    if (name.startsWith("TM:") || name.startsWith("TT:")) {
      timeSlot = name.substring(0, 3) + " " + timeSlot;
      name = name.substring(3).trim();
    }

    if (timeSlot.includes(":") && !timeSlot.match(/\d+ a \d+/)) {
      let parts = timeSlot.split(":");
      if (parts.length == 2 && parts[1].trim() === name) {
        timeSlot = parts[0].trim();
      }
    }

    if (timeSlot.endsWith(":")) {
      timeSlot = timeSlot.substring(0, timeSlot.length - 1).trim();
    }
    if (name.endsWith(":")) {
      name = name.substring(0, name.length - 1).trim();
    }

    if (name) {
      newContacts.push({ name, phone, timeSlot, role });
    }
  });

  office.notes = newNotes.trim();
  office.contacts = newContacts.filter((c) => c.name !== "");
});

function serialize(obj) {
  if (Array.isArray(obj)) {
    return "[\n" + obj.map((o) => serialize(o)).join(",\n") + "\n]";
  } else if (typeof obj === "object" && obj !== null) {
    let props = [];
    for (let key in obj) {
      let val = obj[key];
      if (val === undefined) continue;

      let strVal;
      if (typeof val === "string") {
        strVal = JSON.stringify(val);
      } else if (typeof val === "number") {
        strVal = val;
      } else {
        strVal = serialize(val);
      }
      props.push(`    ${key}: ${strVal}`);
    }
    return "{\n" + props.join(",\n") + "\n  }";
  }
  return JSON.stringify(obj);
}

const newArrayStr = serialize(offices);
const newContent =
  content.substring(0, match.index) +
  "export const mockTelegrafia: Office[] = " +
  newArrayStr +
  ";\n";

fs.writeFileSync("src/data/mock_telegrafia.ts", newContent);
console.log("File updated");
