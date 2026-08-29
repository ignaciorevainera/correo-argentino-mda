import Database from "better-sqlite3";
import { createHmac } from "crypto";
import fs from "fs";

function loadEnv() {
  const env = {};
  const txt = fs.readFileSync(".env", "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const env = loadEnv();
const SECRET = env.SESSION_SECRET || "fallback-secret-do-not-use-in-prod";
const db = new Database("database/mda.db");
const ts = Date.now();
const uname = "perm_verify_" + ts;
const sid = "perm_sess_" + ts;
const u = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?) RETURNING id").get(uname, "x", "admin");
const uid = u.id;
db.prepare("INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)").run(sid, uid, Date.now() + 86400000);
const sig = createHmac("sha256", SECRET).update(sid).digest("base64url");
const cookie = sid + "." + sig;
console.log("COOKIE=" + cookie);
console.log("UID=" + uid);
console.log("SID=" + sid);
console.log("SECRET_LEN=" + SECRET.length);
EOF_MARKER
