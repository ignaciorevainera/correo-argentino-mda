import express from "express";
import compression from "compression";
import * as entry from "./dist/server/entry.mjs";

const ssrHandler = entry.handler ?? entry.default;

const app = express();

app.use(compression());
app.use(
  express.static("dist/client", { immutable: true, maxAge: "1y" }),
);
app.use(ssrHandler);

const port = Number(process.env.PORT) || 4321;
const host = process.env.HOST || "127.0.0.1";

app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
