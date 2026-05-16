const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath    = path.join(__dirname, 'public', urlPath);
  const contentType = MIME[path.extname(filePath)] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 – Page introuvable</h1>');
      } else {
        res.writeHead(500);
        res.end('Erreur serveur');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));