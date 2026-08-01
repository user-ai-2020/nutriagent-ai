import { createServer } from "node:http";
import { spawnSync } from "node:child_process";

const CMD =
  "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))";

function runCheck(port) {
  // Use the exact HEALTHCHECK one-liner; allow time for connection refusal / slow localhost on Windows.
  const result = spawnSync("node", ["-e", CMD], {
    env: { ...process.env, PORT: String(port) },
    encoding: "utf8",
    timeout: 30000,
  });
  return result.status ?? 1;
}

function withServer(statusCode, fn) {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(statusCode);
      res.end("ok");
    });
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      // Brief yield so the test server is accepting before the HEALTHCHECK fetch runs.
      setTimeout(() => {
        Promise.resolve(fn(port))
        .then((result) => {
          server.close(() => resolve(result));
        })
        .catch((err) => {
          server.close(() => reject(err));
        });
      }, 50);
    });
  });
}

const rejectionExit = runCheck(59999);
const non2xxExit = await withServer(503, (port) => runCheck(port));
const okExit = await withServer(200, (port) => runCheck(port));

console.log(JSON.stringify({ rejectionExit, non2xxExit, okExit }, null, 2));
process.exit(rejectionExit === 1 && non2xxExit === 1 && okExit === 0 ? 0 : 1);
