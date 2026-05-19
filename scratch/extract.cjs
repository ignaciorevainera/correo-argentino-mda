const fs = require("fs");

const content = fs.readFileSync("src/data/mock_telegrafia.ts", "utf8");

const officesRegex =
  /id: "(.*?)",[\s\S]*?name: "(.*?)",[\s\S]*?notes: (.*?),[\s\S]*?contacts: (\[[\s\S]*?\]),/g;

let match;
const issues = [];
while ((match = officesRegex.exec(content)) !== null) {
  const id = match[1];
  const name = match[2];
  const notes = match[3];
  const contactsStr = match[4];

  let notesClean = notes.replace(/^"(.*)"$/, "$1");

  if (notesClean.length > 0 || contactsStr.length > 5) {
    issues.push({ id, name, notes: notesClean, contacts: contactsStr });
  }
}

fs.writeFileSync("scratch/issues.json", JSON.stringify(issues, null, 2));
