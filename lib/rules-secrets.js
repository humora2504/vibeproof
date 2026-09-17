'use strict';
const { redact, lineOf, jwtPayload, isClientSide, stripComments, looksPlaceholder, insideRegexLiteral } = require('./util');

// Credential shapes that are secret by definition. The Supabase *anon* key is
// deliberately absent: it is meant to be public and flagging it is noise.
const PATTERNS = [
  { id: 'stripe-secret',   re: /\bsk_live_[A-Za-z0-9]{20,}/g,           name: 'Stripe live secret key',      sev: 'critical' },
  { id: 'stripe-restricted', re: /\brk_live_[A-Za-z0-9]{20,}/g,         name: 'Stripe live restricted key',  sev: 'critical' },
  { id: 'stripe-test',     re: /\bsk_test_[A-Za-z0-9]{20,}/g,           name: 'Stripe test secret key',      sev: 'medium' },
  { id: 'openai',          re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g,    name: 'OpenAI API key',              sev: 'critical' },
  { id: 'anthropic',       re: /\bsk-ant-[A-Za-z0-9_-]{24,}/g,          name: 'Anthropic API key',           sev: 'critical' },
  { id: 'aws-access-key',  re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,        name: 'AWS access key id',           sev: 'critical' },
  { id: 'google-api',      re: /\bAIza[0-9A-Za-z_-]{35}\b/g,            name: 'Google API key',              sev: 'high' },
  { id: 'github-token',    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, name: 'GitHub token',        sev: 'critical' },
  { id: 'slack-token',     re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,       name: 'Slack token',                 sev: 'high' },
  { id: 'sendgrid',        re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, name: 'SendGrid API key',    sev: 'high' },
  { id: 'twilio',          re: /\bSK[0-9a-fA-F]{32}\b/g,                name: 'Twilio API key SID',          sev: 'high' },
  { id: 'private-key',     re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, name: 'Private key block', sev: 'critical' },
  { id: 'supabase-secret', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g,       name: 'Supabase secret key',         sev: 'critical' },
  { id: 'resend',          re: /\bre_[A-Za-z0-9_-]{24,}/g,              name: 'Resend API key',              sev: 'high' },
];

// Env-var names whose value must never reach the browser.
const SECRET_NAME = /(SERVICE_ROLE|SECRET|PRIVATE_KEY|_TOKEN|PASSWORD|PASSWD|_PWD|DATABASE_URL|DB_URL|CONNECTION_STRING|WEBHOOK_SECRET|CLIENT_SECRET|ACCESS_KEY|API_KEY|APIKEY|ADMIN_KEY)/i;
// Names that are public by design and must not be flagged.
const PUBLIC_OK = /(PUBLISHABLE|ANON_KEY|PUBLIC_URL|SUPABASE_URL|MEASUREMENT_ID|SENTRY_DSN|POSTHOG|GA_ID|GTM|MAPBOX_TOKEN|STRIPE_PUBLISHABLE)/i;
const PUBLIC_PREFIX = /^(NEXT_PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|PUBLIC_|GATSBY_|NUXT_PUBLIC_|VUE_APP_)/;

function run(file, text, ctx) {
  const out = [];
  const code = /\.(js|jsx|ts|tsx|mjs|cjs|svelte|vue|astro)$/.test(file.ext) ? stripComments(text) : text;

  // 1. Hardcoded credentials of a known shape.
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(code)) !== null) {
      const val = m[0];
      if (looksPlaceholder(val)) continue;
      if (insideRegexLiteral(code, m.index)) continue;
      if (file.base === '.env.example' || file.rel.endsWith('.example')) continue;
      const client = isClientSide(file.rel);
      out.push({
        rule: 'SECRET-' + p.id.toUpperCase(),
        severity: file.isEnv && !client ? (p.sev === 'critical' ? 'high' : p.sev) : p.sev,
        title: `${p.name} present in ${file.isEnv ? 'an env file' : 'source code'}`,
        file: file.rel, line: lineOf(code, m.index), evidence: redact(val),
        why: file.isEnv
          ? 'Anyone who gets this file, or this repository, holds the key. Env files reach git far more often than people expect.'
          : 'Committed source is copied, forked and bundled. A key in source must be assumed leaked.',
        fix: `Revoke and rotate this credential at the provider now, then load it from a server-side environment variable. Rotating matters more than deleting the line: the old value stays in git history.`,
        confidence: 'high',
      });
    }
  }

  // 2. Supabase service_role JWT anywhere (decodes the token rather than guessing).
  const jwtRe = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
  let j;
  while ((j = jwtRe.exec(code)) !== null) {
    const payload = jwtPayload(j[0]);
    if (!payload) continue;
    const role = payload.role || payload.user_role;
    if (role === 'service_role') {
      const client = isClientSide(file.rel);
      out.push({
        rule: 'SECRET-SUPABASE-SERVICE-ROLE',
        severity: 'critical',
        title: client
          ? 'Supabase service_role key is in code that ships to the browser'
          : 'Supabase service_role key is committed to the repository',
        file: file.rel, line: lineOf(code, j.index), evidence: redact(j[0]),
        why: 'The service_role key bypasses Row Level Security completely. Whoever holds it can read, change and delete every row in every table, whatever your policies say.',
        fix: 'Rotate the service_role key in the Supabase dashboard (Settings, API, Reset). Use it only in server code, never in a NEXT_PUBLIC_ / VITE_ / EXPO_PUBLIC_ variable and never in a client component.',
        confidence: 'high',
      });
    }
  }

  // 3. A secret-shaped value behind a browser-exposed env prefix.
  if (file.isEnv || /\.(env|json|yml|yaml|toml)$/.test(file.ext) || file.base === 'dockerfile') {
    const lines = text.split('\n');
    lines.forEach((ln, i) => {
      const m = ln.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*[:=]\s*(.+?)\s*$/);
      if (!m) return;
      const [, name, rawVal] = m;
      if (!PUBLIC_PREFIX.test(name)) return;
      if (PUBLIC_OK.test(name)) return;
      if (!SECRET_NAME.test(name)) return;
      if (looksPlaceholder(rawVal)) return;
      out.push({
        rule: 'SECRET-PUBLIC-PREFIX',
        severity: 'critical',
        title: `${name} exposes a secret to every visitor`,
        file: file.rel, line: i + 1, evidence: `${name}=${redact(rawVal)}`,
        why: 'Variables with this prefix are inlined into the JavaScript bundle at build time. The value is readable by anyone who opens developer tools on your site.',
        fix: `Rename it without the public prefix, read it only in server code, and rotate the credential: assume the current value is already public.`,
        confidence: 'high',
      });
    });
  }

  // 4. Env file that git is tracking.
  if (file.isEnv && file.base !== '.env.example' && ctx.trackedFiles && ctx.trackedFiles.has(file.rel)) {
    out.push({
      rule: 'SECRET-ENV-COMMITTED',
      severity: 'high',
      title: `${file.rel} is committed to git`,
      file: file.rel, line: 1, evidence: 'tracked by git',
      why: 'Every clone, fork and CI job gets this file, and it stays in history after you delete it.',
      fix: `Add "${file.base}" to .gitignore, run: git rm --cached ${file.rel}, then rotate every credential the file contains.`,
      confidence: 'high',
    });
  }
  return out;
}

module.exports = { run, id: 'secrets' };
