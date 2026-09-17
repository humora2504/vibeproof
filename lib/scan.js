'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { walk, read } = require('./walk');
const { suppressedLines } = require('./util');

const MODULES = [require('./rules-secrets'), require('./rules-database'), require('./rules-app')];
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function gitTracked(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
    return new Set(out.split('\n').filter(Boolean));
  } catch { return null; }
}

function detectStack(root, files) {
  const stack = new Set();
  const names = new Set(files.map(f => f.rel));
  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch {}
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  if (deps['@supabase/supabase-js'] || [...names].some(n => n.startsWith('supabase/'))) stack.add('Supabase');
  if (deps['firebase'] || deps['firebase-admin'] || names.has('firebase.json')) stack.add('Firebase');
  if (deps['next']) stack.add('Next.js');
  if (deps['@prisma/client'] || names.has('prisma/schema.prisma')) stack.add('Prisma');
  if (deps['drizzle-orm']) stack.add('Drizzle');
  if (deps['express'] || deps['fastify'] || deps['hono']) stack.add('Node API');
  if (deps['react'] && !deps['next']) stack.add('React');
  if (deps['vue'] || deps['nuxt']) stack.add('Vue');
  if (deps['svelte'] || deps['@sveltejs/kit']) stack.add('Svelte');
  return [...stack];
}

function scan(root) {
  const started = Date.now();
  const files = [...walk(root)];
  const ctx = {
    root,
    trackedFiles: gitTracked(root),
    hasEnvFile: files.some(f => f.isEnv && f.base !== '.env.example'),
    gitignoresEnv: false,
  };
  const gi = files.find(f => f.base === '.gitignore');
  if (gi) {
    const t = read(gi) || '';
    ctx.gitignoresEnv = /^\s*\.?env/m.test(t) || /^\s*\*\.env/m.test(t);
  }

  let findings = [];
  let scanned = 0;
  for (const f of files) {
    const text = read(f);
    if (text === null) continue;
    scanned++;
    const suppressed = suppressedLines(text);
    if (suppressed.has('ALL')) continue;
    for (const mod of MODULES) {
      let got = [];
      try { got = mod.run(f, text, ctx) || []; }
      catch (e) { /* a broken rule must never break the scan */ }
      findings = findings.concat(got.filter(x => !suppressed.has(x.line)));
    }
  }
  for (const mod of MODULES) {
    if (typeof mod.finalize === 'function') {
      try { findings = findings.concat(mod.finalize(ctx) || []); } catch {}
    }
  }

  // Deduplicate identical rule+file+line, keeping the first.
  const seen = new Set();
  findings = findings.filter(f => {
    const k = `${f.rule}|${f.file}|${f.line}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  // A specific rule on a line wins over the generic one, so one mistake is reported once.
  const specific = new Set(findings.filter(f => f.rule !== 'SECRET-PUBLIC-PREFIX').map(f => `${f.file}|${f.line}`));
  findings = findings.filter(f => !(f.rule === 'SECRET-PUBLIC-PREFIX' && specific.has(`${f.file}|${f.line}`)));

  findings.sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || a.file.localeCompare(b.file) || a.line - b.line);

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;

  return {
    tool: 'vibeproof',
    version: require('../package.json').version,
    scanned_at: new Date().toISOString(),
    root: path.basename(path.resolve(root)),
    stack: detectStack(root, files),
    files_scanned: scanned,
    duration_ms: Date.now() - started,
    counts,
    total: findings.length,
    findings,
  };
}

module.exports = { scan, SEV_ORDER };
