// Adds a fixed delay to every DynamoDB call in front of dynalite, so a local import run waits on
// round trips the way the real service does (in-region calls take roughly 5-25ms each).
//   SIM_DDB=http://localhost:4667 PORT=4767 LATENCY_MS=15 node docs/loadtest/latencyProxy.mjs
import http from "node:http";

const target = new URL(process.env.SIM_DDB || "http://localhost:4667");
if (target.hostname !== "localhost") throw new Error("Refusing to proxy a non-local DynamoDB");
const PORT = Number(process.env.PORT || 4767);
const LATENCY_MS = Number(process.env.LATENCY_MS || 15);
const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      setTimeout(() => {
        const up = http.request(
          { host: target.hostname, port: target.port, path: req.url, method: req.method, headers: req.headers, agent },
          (upRes) => {
            res.writeHead(upRes.statusCode, upRes.headers);
            upRes.pipe(res);
          }
        );
        up.on("error", (e) => { res.writeHead(502); res.end(String(e.message)); });
        up.end(Buffer.concat(chunks));
      }, LATENCY_MS);
    });
  })
  .listen(PORT, () => console.log(`latency proxy :${PORT} -> ${target.host} (+${LATENCY_MS}ms)`));
