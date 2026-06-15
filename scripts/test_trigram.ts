import Database from 'better-sqlite3';
const db = new Database(':memory:');
db.exec("CREATE VIRTUAL TABLE t USING fts5(x, tokenize='trigram');");
db.exec("INSERT INTO t VALUES('1428ZABW0001');");
db.exec("INSERT INTO t VALUES('A0000308');");
console.log(db.prepare("SELECT * FROM t WHERE x MATCH 'zabw'").all());
console.log(db.prepare("SELECT * FROM t WHERE x MATCH '308'").all());
