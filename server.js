require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');

console.log('BOOT SERVER OK — fichier chargé, PORT =', process.env.PORT);
console.log('DATABASE_URL chargée ?', !!process.env.DATABASE_URL);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- Connexion PostgreSQL ---
// En local : DATABASE_URL vient du .env (DATABASE_PUBLIC_URL de Railway).
// En prod (Railway) : DATABASE_URL est injectée automatiquement (réseau interne).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway.internal')
    ? false
    : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL,
      player TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 0 AND rating <= 5),
      comment TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS reviews_session_player_uidx
    ON reviews (session_id, lower(player));
  `);

  console.log('DB OK — table "reviews" prête.');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function rowToReview(row) {
  return {
    sessionId: row.session_id,
    player: row.player,
    rating: row.rating,
    comment: row.comment || '',
    updatedAt: row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : row.updated_at,
  };
}

async function readReviews() {
  const { rows } = await pool.query(
    'SELECT * FROM reviews ORDER BY id ASC'
  );
  return rows.map(rowToReview);
}

async function upsertReview(review) {
  const { rows } = await pool.query(
    `INSERT INTO reviews (session_id, player, rating, comment, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (session_id, lower(player))
     DO UPDATE SET
       player = EXCLUDED.player,
       rating = EXCLUDED.rating,
       comment = EXCLUDED.comment,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [review.sessionId, review.player, review.rating, review.comment, review.updatedAt]
  );
  return rowToReview(rows[0]);
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

  if (pathname === '/reviews' && req.method === 'GET') {
    try {
      const reviews = await readReviews();
      return sendJson(res, 200, reviews);
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Erreur serveur.' });
    }
  }

  if (pathname === '/reviews' && req.method === 'POST') {
    try {
      const body = await collectJsonBody(req);
      const normalized = normalizeReview(body);

      if (normalized.error) {
        return sendJson(res, 400, { error: normalized.error });
      }

      const review = await upsertReview(normalized.value);
      return sendJson(res, 200, { ok: true, review });
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Erreur serveur.' });
    }
  }

  if (pathname === '/reviews' && req.method === 'OPTIONS') {
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

initDb()
  .then(() => {
    server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Échec de connexion à PostgreSQL :', err);
    process.exit(1);
  });
