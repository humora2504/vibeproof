'use strict';

/** Redact a secret so a finding can be shown, logged or pasted safely. */
function redact(s) {
  if (!s) return '';
  const t = String(s).trim();
  if (t.length <= 12) return t.slice(0, 2) + '***';
  return t.slice(0, 6) + '…' + t.slice(-4) + ` (${t.length} chars)`;
}

/** Line number (1-indexed) of a character offset. */
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Decode a JWT payload without verifying. Returns null when it is not a JWT. */
function jwtPayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const obj = JSON.parse(json);
    return typeof obj === 'object' && obj ? obj : null;
  } catch { return null; }
}

/** True when the file is shipped to the browser (heuristic, deliberately generous). */
function isClientSide(rel) {
  const p = rel.toLowerCase();
  if (/(^|\/)(app|src|components|pages|lib|hooks|context|stores?|utils)\//.test(p) === false
      && !/\.(jsx|tsx|svelte|vue|astro|html)$/.test(p)) return false;
  if (/(^|\/)(api|server|actions?|middleware|functions?|edge|scripts?|migrations?)\//.test(p)) return false;
  if (/\.(server|node)\.(js|ts|jsx|tsx)$/.test(p)) return false;
  if (/(^|\/)route\.(js|ts)$/.test(p)) return false;
  return true;
}

/** Strip // and /* *​/ comments so commented-out code does not create findings. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(Math.max(0, m.length - p1.length)));
}

const PLACEHOLDER = /(your[-_]|my[-_]|example|placeholder|changeme|change[-_]me|<[^>]+>|\.\.\.|dummy|sample|insert[-_]here|replace[-_]me|todo|redacted|\bfake\b)/i;
const ALL_SAME = /^(.)\1{7,}$/;                       // xxxxxxxx, 00000000
const SEQUENTIAL = /^(?:0?123456789?|abcdef(?:gh)?)$/i;

/** True when a value is obviously a placeholder rather than a live credential. */
function looksPlaceholder(v) {
  const t = String(v).trim().replace(/^["']|["']$/g, '');
  if (!t || t.length < 8) return true;
  if (PLACEHOLDER.test(t)) return true;
  if (ALL_SAME.test(t) || SEQUENTIAL.test(t)) return true;
  if (/^[*x.\u2026]+$/i.test(t)) return true;
  if (/^(your|the)[-_ ]/i.test(t)) return true;
  return false;
}

/** True when the match at `index` sits inside a regular-expression literal. */
function insideRegexLiteral(text, index) {
  if (index <= 0) return false;
  const prev = text[index - 1];
  if (prev === '/' && text[index - 2] !== '/' && text[index - 2] !== '*') return true;
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const before = text.slice(lineStart, index);
  const opens = (before.match(/(?:^|[=(,:[]|\breturn|\bmatch|\btest|\bexec|\breplace)\s*\//g) || []).length;
  const closes = (before.match(/\/[gimsuy]*\s*(?:[),\];]|$)/g) || []).length;
  return opens > closes;
}

/** Lines the author marked with a vibeproof suppression comment. */
function suppressedLines(text) {
  const out = new Set();
  const lines = text.split('\n');
  lines.forEach((ln, i) => {
    if (/vibeproof-ignore-file/.test(ln)) { out.add('ALL'); return; }
    if (/vibeproof-ignore-next-line/.test(ln)) out.add(i + 2);
    if (/vibeproof-ignore\b(?!-)/.test(ln)) out.add(i + 1);
  });
  return out;
}

module.exports = { redact, lineOf, jwtPayload, isClientSide, stripComments, looksPlaceholder, insideRegexLiteral, suppressedLines };
