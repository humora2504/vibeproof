'use strict';
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  '.turbo', '.vercel', '.netlify', 'vendor', '.venv', 'venv', '__pycache__', '.cache', 'target',
  '.svelte-kit', '.nuxt', '.output', 'Pods', '.gradle', '.idea', '.expo']);
const TEXT_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.env', '.sql',
  '.rules', '.yml', '.yaml', '.toml', '.py', '.rb', '.go', '.php', '.svelte', '.vue', '.astro',
  '.html', '.md', '.sh', '.txt', '.tf', '.conf', '.ini', '.properties', '.gradle', '.plist']);
const MAX_BYTES = 1.5 * 1024 * 1024;

/** Read .vibeproofignore: one path prefix or simple glob per line, # for comments. */
function loadIgnores(root) {
  let text = '';
  try { text = fs.readFileSync(path.join(root, '.vibeproofignore'), 'utf8'); } catch { return []; }
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.replace(/^\.?\//, '').replace(/\/$/, ''))
    .map(pattern => {
      const rx = '^' + pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '.*');
      return new RegExp(rx + '(/|$)');
    });
}

/** Yield {abs, rel, ext, base} for every scannable text file under root. */
function* walk(root, sub = '', ignores = null) {
  if (ignores === null) ignores = loadIgnores(root);
  const dir = path.join(root, sub);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const rel = sub ? path.join(sub, e.name) : e.name;
    const relPosix = rel.split(path.sep).join('/');
    if (e.isSymbolicLink()) continue;
    if (ignores.some(rx => rx.test(relPosix))) continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(root, rel, ignores);
      continue;
    }
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    const base = e.name.toLowerCase();
    const isEnv = base === '.env' || base.startsWith('.env.');
    const named = ['dockerfile', 'procfile', '.gitignore', 'firebase.json'].includes(base);
    if (!isEnv && !named && !TEXT_EXT.has(ext)) continue;
    const abs = path.join(root, rel);
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (st.size > MAX_BYTES || st.size === 0) continue;
    yield { abs, rel: rel.split(path.sep).join('/'), ext, base, size: st.size, isEnv };
  }
}

function read(file) {
  try {
    const buf = fs.readFileSync(file.abs);
    if (buf.includes(0)) return null;            // binary
    return buf.toString('utf8');
  } catch { return null; }
}

module.exports = { walk, read, SKIP_DIRS, loadIgnores };
