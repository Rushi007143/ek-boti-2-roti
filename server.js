const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4200;
const publicDir = __dirname;

const server = http.createServer((req, res) => {
  const cleanUrl = req.url.split("?")[0];

  let filePath = path.join(
    publicDir,
    cleanUrl === "/" ? "index.html" : cleanUrl,
  );

  const extname = path.extname(filePath).toLowerCase();

  let contentType = "text/html";

  switch (extname) {
    case ".js":
      contentType = "text/javascript";
      break;
    case ".css":
      contentType = "text/css";
      break;
    case ".json":
      contentType = "application/json";
      break;
    case ".png":
      contentType = "image/png";
      break;
    case ".jpg":
    case ".jpeg":
      contentType = "image/jpeg";
      break;
    case ".svg":
      contentType = "image/svg+xml";
      break;
    case ".webp":
      contentType = "image/webp";
      break;
    case ".mp4":
      contentType = "video/mp4";
      break;

    case ".woff":
      contentType = "font/woff";
      break;
    case ".woff2":
      contentType = "font/woff2";
      break;
    case ".ttf":
      contentType = "font/ttf";
      break;
    case ".eot":
      contentType = "application/vnd.ms-fontobject";
      break;

    default:
      contentType = "text/html"; // 🔥 FIX
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
