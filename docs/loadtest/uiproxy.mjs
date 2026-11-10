// Sandbox UI: CRA dev server on 3097 + front proxy on 3098 that sends ALL /api
// traffic to the dynalite-backed sandbox API (SANDBOX_API_PORT, default 5099; never 5050/prod).
import http from "node:http";
import { spawn } from "node:child_process";

const API_PORT = Number(process.env.SANDBOX_API_PORT || 5099);
if (API_PORT === 5050) throw new Error("Refusing to proxy to the real API");

const cra = spawn("npm", ["run", "start"], {
  cwd: "/Users/samdeacon/Desktop/peelthestickers",
  env: { ...process.env, PORT: "3097", BROWSER: "none", REACT_APP_API_PROXY_TARGET: `http://localhost:${API_PORT}` },
  stdio: "inherit",
});
process.on("exit", () => cra.kill());

function forward(req, res, port) {
  const up = http.request(
    { host: "localhost", port, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${port}` } },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    }
  );
  up.on("error", (e) => {
    res.writeHead(502);
    res.end(String(e));
  });
  req.pipe(up);
}

http
  .createServer((req, res) => forward(req, res, req.url.startsWith("/api") ? API_PORT : 3097))
  .listen(3098, () => console.log(`sandbox UI proxy on http://localhost:3098 (api -> ${API_PORT})`));
