require("http").createServer(function (q, s) {
  console.log("[hang-server] got", q.method, q.url, "at", Date.now());
  // intentionally never respond
}).listen(9999, "127.0.0.1", function () {
  console.log("[hang-server] listening on 9999");
});
