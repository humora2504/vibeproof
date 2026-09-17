'use strict';
const fs = require('fs');
const path = require('path');
const { scan } = require('../lib/scan');

// The fixtures need credentials that look real enough to exercise the detectors.
// Nothing shaped like a key is stored in this repository: the values are built
// here, written to a temporary .env for the duration of the run, and deleted on
// exit. That keeps secret scanners quiet without weakening the test.
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function jwt(role) {
  return ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', b64url({ role, iss: 'supabase', ref: 'abcdefgh' }),
          'fixture' + 'signature' + role.length].join('.');
}
const FAKE = {
  __ANON_JWT__: jwt('anon'),
  __SERVICE_JWT__: jwt('service_role'),
  // Split so the literal never appears as one string anywhere on disk.
  __STRIPE_LIVE__: ['sk', 'live', '51QaBcDeFgHiJkLmNoPqRsTuVwXyZ0987'].join('_'),
  __DB_PASSWORD__: 'fixtureOnlyPassw0rd',
};
const MATERIALISE = [
  ['fixtures/vulnerable/env.fixture', 'fixtures/vulnerable/.env'],
  ['fixtures/clean/env.example.fixture', 'fixtures/clean/.env.example'],
];
for (const [from, to] of MATERIALISE) {
  let body = fs.readFileSync(path.join(__dirname, from), 'utf8');
  for (const [token, value] of Object.entries(FAKE)) body = body.split(token).join(value);
  fs.writeFileSync(path.join(__dirname, to), body);
}
const cleanUp = () => { for (const [, to] of MATERIALISE) { try { fs.unlinkSync(path.join(__dirname, to)); } catch {} } };
process.on('exit', cleanUp);
process.on('SIGINT', () => { cleanUp(); process.exit(130); });

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('vibeproof test suite\n');

// --- A vulnerable project must produce every expected finding ---
const v = scan(path.join(__dirname, 'fixtures', 'vulnerable'));
const rules = new Set(v.findings.map(f => f.rule));
console.log('vulnerable fixture:');
const EXPECTED = [
  'SECRET-SUPABASE-SERVICE-ROLE', 'SECRET-STRIPE-SECRET', 'DB-CONNECTION-STRING',
  'DB-RLS-NOT-ENABLED', 'DB-POLICY-ALWAYS-TRUE', 'DB-GRANT-ANON-WRITE', 'DB-PUBLIC-BUCKET',
  'DB-FIREBASE-OPEN-RULE', 'APP-SERVICE-CLIENT-IN-BROWSER', 'APP-UNAUTHENTICATED-MUTATION',
  'APP-WEAK-SIGNING-SECRET', 'APP-GITIGNORE-MISSING-ENV',
];
for (const r of EXPECTED) check(`detects ${r}`, rules.has(r));
check('both unprotected tables reported', v.findings.filter(f => f.rule === 'DB-RLS-NOT-ENABLED').length === 2,
  `got ${v.findings.filter(f => f.rule === 'DB-RLS-NOT-ENABLED').length}`);
check('protected table not reported', !v.findings.some(f => f.rule === 'DB-RLS-NOT-ENABLED' && /posts/.test(f.evidence)));
check('stack detected', v.stack.includes('Supabase') && v.stack.includes('Next.js'), v.stack.join(','));
check('no secret is printed in full', !JSON.stringify(v.findings).includes(FAKE.__DB_PASSWORD__));
check('anon key is not flagged', !v.findings.some(f => /anon/i.test(f.evidence || '') && f.rule.startsWith('SECRET')));

// --- A correctly built project must produce nothing ---
const c = scan(path.join(__dirname, 'fixtures', 'clean'));
console.log('\nclean fixture:');
check('no findings at all', c.total === 0, c.findings.map(f => f.rule + '@' + f.file).join(', '));
check('.env.example placeholders ignored', !c.findings.some(f => f.file.includes('.env.example')));
check('server-only service role client accepted', !c.findings.some(f => f.rule === 'APP-SERVICE-CLIENT-IN-BROWSER'));
check('authenticated route accepted', !c.findings.some(f => f.rule === 'APP-UNAUTHENTICATED-MUTATION'));

// --- Report shape ---
console.log('\nignore file:');
{
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vpig-'));
  fs.mkdirSync(path.join(tmp, 'skipme'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'skipme', 'x.sql'),
    'create table public.leaky (id uuid primary key, user_id uuid);');
  fs.writeFileSync(path.join(tmp, 'keep.sql'),
    'create table public.other (id uuid primary key, user_id uuid);');
  const before = scan(tmp);
  fs.writeFileSync(path.join(tmp, '.vibeproofignore'), '# comment\nskipme/\n');
  const after = scan(tmp);
  check('without an ignore file both tables are reported', before.total === 2, 'got ' + before.total);
  check('.vibeproofignore skips the listed directory', after.total === 1, 'got ' + after.total);
  check('the unignored table is still reported', after.findings[0] && /other/.test(after.findings[0].title));
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\nreport contract:');
check('every finding has a fix', v.findings.every(f => f.fix && f.fix.length > 20));
check('every finding has a why', v.findings.every(f => f.why && f.why.length > 20));
check('every finding has file and line', v.findings.every(f => f.file && Number.isInteger(f.line)));
check('severities are valid', v.findings.every(f => ['critical', 'high', 'medium', 'low'].includes(f.severity)));
check('counts match findings', Object.values(v.counts).reduce((a, b) => a + b, 0) === v.total);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
