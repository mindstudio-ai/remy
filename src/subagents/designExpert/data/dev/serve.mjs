/**
 * Lightweight dev server for visualizing and managing design expert data.
 *
 * Zero dependencies — uses Node's built-in http module.
 * Reads/writes fonts.json and inspiration.json in the parent directory.
 *
 * Usage: node src/subagents/designExpert/data/dev/serve.mjs
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..');
const fontsPath = join(dataDir, 'fonts.json');
const inspirationPath = join(dataDir, 'inspiration.json');

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJson(path, data) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, path);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function notFound(res) {
  res.writeHead(404);
  res.end('Not found');
}

function error(res, msg, status = 400) {
  json(res, { error: msg }, status);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  // CORS for dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Serve HTML
    if (path === '/' && method === 'GET') {
      const html = readFileSync(join(__dirname, 'index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    // --- Fonts API ---

    if (path === '/api/fonts' && method === 'GET') {
      return json(res, readJson(fontsPath));
    }

    if (path === '/api/fonts' && method === 'POST') {
      const font = await parseBody(req);
      const data = readJson(fontsPath);
      if (data.fonts.some((f) => f.slug === font.slug)) {
        return error(res, `Font with slug "${font.slug}" already exists`);
      }
      data.fonts.push(font);
      writeJson(fontsPath, data);
      return json(res, { ok: true, count: data.fonts.length }, 201);
    }

    const fontDeleteMatch = path.match(/^\/api\/fonts\/(.+)$/);
    if (fontDeleteMatch && method === 'DELETE') {
      const slug = decodeURIComponent(fontDeleteMatch[1]);
      const data = readJson(fontsPath);
      const before = data.fonts.length;
      data.fonts = data.fonts.filter((f) => f.slug !== slug);
      // Also remove pairings that reference this font
      data.pairings = data.pairings.filter(
        (p) => p.heading.slug !== slug && p.body.slug !== slug,
      );
      if (data.fonts.length === before) {
        return error(res, `Font "${slug}" not found`, 404);
      }
      writeJson(fontsPath, data);
      return json(res, { ok: true, count: data.fonts.length });
    }

    // --- Pairings API ---

    if (path === '/api/pairings' && method === 'POST') {
      const pairing = await parseBody(req);
      const data = readJson(fontsPath);
      data.pairings.push(pairing);
      writeJson(fontsPath, data);
      return json(res, { ok: true, count: data.pairings.length }, 201);
    }

    const pairingDeleteMatch = path.match(/^\/api\/pairings\/(\d+)$/);
    if (pairingDeleteMatch && method === 'DELETE') {
      const index = parseInt(pairingDeleteMatch[1], 10);
      const data = readJson(fontsPath);
      if (index < 0 || index >= data.pairings.length) {
        return error(res, 'Pairing index out of range', 404);
      }
      data.pairings.splice(index, 1);
      writeJson(fontsPath, data);
      return json(res, { ok: true, count: data.pairings.length });
    }

    // --- Inspiration API ---

    if (path === '/api/inspiration' && method === 'GET') {
      return json(res, readJson(inspirationPath));
    }

    if (path === '/api/inspiration' && method === 'POST') {
      const entry = await parseBody(req);
      const data = readJson(inspirationPath);
      data.images.push(entry);
      writeJson(inspirationPath, data);
      return json(res, { ok: true, count: data.images.length }, 201);
    }

    const inspirationDeleteMatch = path.match(/^\/api\/inspiration\/(\d+)$/);
    if (inspirationDeleteMatch && method === 'DELETE') {
      const index = parseInt(inspirationDeleteMatch[1], 10);
      const data = readJson(inspirationPath);
      if (index < 0 || index >= data.images.length) {
        return error(res, 'Image index out of range', 404);
      }
      data.images.splice(index, 1);
      writeJson(inspirationPath, data);
      return json(res, { ok: true, count: data.images.length });
    }

    if (path === '/api/inspiration/analyze' && method === 'POST') {
      const { url } = await parseBody(req);
      if (!url) return error(res, 'url is required');

      const prompt = `Analyze this website/app screenshot as a design reference. Assess:
1) Mood/aesthetic
2) Color palette with approximate hex values and palette strategy
3) Typography style
4) Layout composition (symmetric/asymmetric, grid structure, whitespace usage, content density)
5) What makes it distinctive and interesting vs generic AI-generated interfaces
Be specific and concise.`;

      try {
        const result = execSync(
          `mindstudio analyze-image --prompt ${JSON.stringify(prompt)} --image-url ${JSON.stringify(url)} --output-key analysis --no-meta`,
          { encoding: 'utf-8', timeout: 120000 },
        ).trim();
        return json(res, { url, analysis: result });
      } catch (err) {
        return error(res, `Analysis failed: ${err.message}`, 500);
      }
    }

    if (path === '/api/inspiration/dedup' && method === 'POST') {
      const data = readJson(inspirationPath);
      const seen = new Set();
      const deduped = [];
      for (const img of data.images) {
        if (!seen.has(img.url)) {
          seen.add(img.url);
          deduped.push(img);
        }
      }
      const removed = data.images.length - deduped.length;
      data.images = deduped;
      writeJson(inspirationPath, data);
      return json(res, { ok: true, removed, count: deduped.length });
    }

    notFound(res);
  } catch (err) {
    error(res, err.message, 500);
  }
});

const PORT = parseInt(process.env.PORT || '3333', 10);
server.listen(PORT, () => {
  console.log(`Design data dev tool: http://localhost:${PORT}`);
  // Try to open in browser
  try {
    const cmd =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'start'
          : 'xdg-open';
    execSync(`${cmd} http://localhost:${PORT}`, { stdio: 'ignore' });
  } catch {}
});
