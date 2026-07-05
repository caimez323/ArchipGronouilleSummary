const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const REVIEWS_FILE = path.join(PUBLIC_DIR, 'reviews.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function ensureReviewsFile() {
  if (!fs.existsSync(REVIEWS_FILE)) {
    fs.writeFileSync(REVIEWS_FILE, '[]', 'utf-8');
  }
}

function readReviews() {
  ensureReviewsFile();
  try {
    const raw = fs.readFileSync(REVIEWS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReviews(reviews) {
  return new Promise((resolve, reject) => {
    fs.writeFile(REVIEWS_FILE, JSON.stringify(reviews, null, 2), 'utf-8', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function collectJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload trop volumineux.'));
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON invalide.'));
      }
    });

    req.on('error', reject);
  });
}

function normalizeReview(input) {
  const sessionId = Number(input.sessionId);
  const player = String(input.player || '').trim();
  const rating = input.rating === '' || input.rating == null ? 0 : Number(input.rating);
  const comment = String(input.comment || '').trim();

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return { error: 'sessionId invalide.' };
  }

  if (!player) {
    return { error: 'player est requis.' };
  }

  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    return { error: 'rating doit être un entier entre 0 et 5.' };
  }

  if (comment.length > 300) {
    return { error: 'comment trop long (300 caractères max).' };
  }

  return {
    value: {
      sessionId,
      player,
      rating,
      comment,
      updatedAt: new Date().toISOString(),
    }
  };
}

async function handleApi(req, res) {
  const pathname = req.url.split('?')[0];

  if (pathname === '/api/reviews' && req.method === 'GET') {
    return sendJson(res, 200, readReviews());
  }

  if (pathname === '/api/reviews' && req.method === 'POST') {
    try {
      const body = await collectJsonBody(req);
      const normalized = normalizeReview(body);

      if (normalized.error) {
        return sendJson(res, 400, { error: normalized.error });
      }

      const review = normalized.value;
      const reviews = readReviews();

      const index = reviews.findIndex(r =>
        Number(r.sessionId) === review.sessionId &&
        String(r.player).trim().toLowerCase() === review.player.trim().toLowerCase()
      );

      if (index >= 0) {
        reviews[index] = { ...reviews[index], ...review };
      } else {
        reviews.push(review);
      }

      await writeReviews(reviews);
      return sendJson(res, 200, { ok: true, review });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Erreur serveur.' });
    }
  }

  if (pathname === '/api/reviews' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Allow': 'GET, POST, OPTIONS'
    });
    res.end();
    return;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const apiHandled = await handleApi(req, res);
  if (apiHandled !== false) return;

  let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  const contentType = MIME[path.extname(filePath)] || 'text/plain; charset=utf-8';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 – Page introuvable</h1>');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Erreur serveur');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));