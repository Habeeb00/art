// Serve public/ locally: npm run preview, then open http://localhost:8000/?preview
// (?preview paints with Pollinations from the browser; ?demo paints random local paint.)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".md": "text/plain" };
const port = Number(process.env.PORT) || 8000;
http.createServer((req, res) => {
  const p = path.join(PUBLIC, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!p.startsWith(PUBLIC) || !fs.existsSync(p)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/?preview`));
