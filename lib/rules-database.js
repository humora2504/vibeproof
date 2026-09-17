'use strict';
const { lineOf, stripComments } = require('./util');

/** Collect table names created in SQL and whether RLS is ever enabled for them. */
function analyseSql(text) {
  const created = new Map();   // table -> line
  const rlsOn = new Set();
  const rlsForced = new Set();

  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?(?:public|auth|storage)"?\s*\.\s*)?"?([a-z0-9_]+)"?/gi;
  let m;
  while ((m = createRe.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    if (!created.has(name)) created.set(name, lineOf(text, m.index));
  }
  const rlsRe = /alter\s+table\s+(?:only\s+)?(?:"?(?:public|auth|storage)"?\s*\.\s*)?"?([a-z0-9_]+)"?\s+(enable|force)\s+row\s+level\s+security/gi;
  while ((m = rlsRe.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    rlsOn.add(name);
    if (m[2].toLowerCase() === 'force') rlsForced.add(name);
  }
  return { created, rlsOn, rlsForced };
}

function run(file, text, ctx) {
  const out = [];

  // ---------- SQL / Supabase migrations ----------
  if (file.ext === '.sql') {
    const sql = text.replace(/--[^\n]*/g, m => ' '.repeat(m.length));
    const { created, rlsOn } = analyseSql(sql);
    ctx.sql = ctx.sql || { created: new Map(), rlsOn: new Set(), files: new Map() };
    for (const [t, ln] of created) if (!ctx.sql.created.has(t)) { ctx.sql.created.set(t, { file: file.rel, line: ln }); }
    for (const t of rlsOn) ctx.sql.rlsOn.add(t);

    // Policy that grants everything to everyone.
    const polRe = /create\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:"?(?:public|storage)"?\s*\.\s*)?"?([a-z0-9_]+)"?([\s\S]{0,400}?);/gi;
    let p;
    while ((p = polRe.exec(sql)) !== null) {
      const [, polName, table, body] = p;
      const toAnon = /\bto\s+(anon|public|authenticated\s*,\s*anon|anon\s*,\s*authenticated)\b/i.test(body) || !/\bto\s+/i.test(body);
      const alwaysTrue = /\b(using|with\s+check)\s*\(\s*true\s*\)/i.test(body);
      if (alwaysTrue && toAnon) {
        const forAll = /\bfor\s+all\b/i.test(body) || !/\bfor\s+(select|insert|update|delete)\b/i.test(body);
        out.push({
          rule: 'DB-POLICY-ALWAYS-TRUE',
          severity: forAll ? 'critical' : 'high',
          title: `Policy "${polName.trim()}" on ${table} allows ${forAll ? 'every operation' : 'access'} to anyone`,
          file: file.rel, line: lineOf(sql, p.index),
          evidence: `using (true)${forAll ? ', for all' : ''}`,
          why: forAll
            ? 'Row Level Security is switched on but this policy passes for every request, including unauthenticated ones. Any visitor can read, insert, update and delete rows through the public REST endpoint.'
            : 'This policy passes for every request, so the data in this table is effectively public.',
          fix: `Replace the condition with an ownership check, for example: using (auth.uid() = user_id). If the table really is public reference data, restrict the policy to "for select" and grant it to anon only.`,
          confidence: 'high',
        });
      }
    }

    // Privileges handed straight to the anonymous role.
    const grantRe = /grant\s+([^;]{0,200}?)\s+on\s+([^;]{0,200}?)\s+to\s+([^;]{0,100});/gi;
    let g;
    while ((g = grantRe.exec(sql)) !== null) {
      const [, privs, target, roles] = g;
      if (!/\banon\b/i.test(roles)) continue;
      if (/\b(all|insert|update|delete|truncate)\b/i.test(privs)) {
        out.push({
          rule: 'DB-GRANT-ANON-WRITE',
          severity: 'critical',
          title: `Write privileges granted to the anonymous role on ${target.trim().slice(0, 60)}`,
          file: file.rel, line: lineOf(sql, g.index), evidence: `grant ${privs.trim().slice(0, 40)} … to ${roles.trim()}`,
          why: 'The anon role is the role every unauthenticated visitor uses. Granting it write privileges lets anyone change your data directly through the API.',
          fix: 'Revoke these privileges from anon and grant them to authenticated, then control the rows with a Row Level Security policy.',
          confidence: 'high',
        });
      }
    }

    // Storage buckets created as public.
    const bucketRe = /insert\s+into\s+storage\.buckets[\s\S]{0,300}?;/gi;
    let b;
    while ((b = bucketRe.exec(sql)) !== null) {
      if (/\btrue\b/i.test(b[0]) && /public/i.test(b[0])) {
        out.push({
          rule: 'DB-PUBLIC-BUCKET',
          severity: 'medium',
          title: 'Storage bucket created as public',
          file: file.rel, line: lineOf(sql, b.index), evidence: 'storage.buckets … public = true',
          why: 'Every object in a public bucket is readable by URL without authentication. That is correct for avatars and wrong for invoices, uploads and user documents.',
          fix: 'If the bucket holds anything user-specific, set public = false and serve files through signed URLs.',
          confidence: 'medium',
        });
      }
    }
  }

  // ---------- Firebase security rules ----------
  if (/\.rules$/.test(file.ext) || /firestore\.rules|storage\.rules|database\.rules\.json/.test(file.base)) {
    const body = text.replace(/\/\/[^\n]*/g, ' ');
    const openRe = /allow\s+([a-z,\s]*?)\s*:\s*if\s+true\s*;/gi;
    let o;
    while ((o = openRe.exec(body)) !== null) {
      const ops = (o[1] || 'read, write').trim();
      const writes = /write|create|update|delete/i.test(ops);
      out.push({
        rule: 'DB-FIREBASE-OPEN-RULE',
        severity: writes ? 'critical' : 'high',
        title: `Firebase rule allows ${ops} to anyone`,
        file: file.rel, line: lineOf(body, o.index), evidence: `allow ${ops}: if true;`,
        why: writes
          ? 'Anyone on the internet can read and overwrite this data with a single HTTP request. No login required.'
          : 'This collection is world-readable, including any personal data it holds.',
        fix: 'Replace "if true" with a real condition, for example: if request.auth != null && request.auth.uid == resource.data.userId.',
        confidence: 'high',
      });
    }
    if (/"\.read"\s*:\s*true|"\.write"\s*:\s*true/.test(body)) {
      const idx = body.search(/"\.(read|write)"\s*:\s*true/);
      out.push({
        rule: 'DB-FIREBASE-OPEN-RTDB',
        severity: 'critical',
        title: 'Realtime Database rules are open to the public',
        file: file.rel, line: lineOf(body, idx), evidence: '".read": true / ".write": true',
        why: 'The whole database can be downloaded or overwritten by anyone who knows the project URL.',
        fix: 'Set the rules to require auth, for example: {"rules": {"users": {"$uid": {".read": "$uid === auth.uid", ".write": "$uid === auth.uid"}}}}',
        confidence: 'high',
      });
    }
  }

  // ---------- Mongo / Postgres connection strings with credentials ----------
  const connRe = /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s"'`<>]*:[^\s"'`<>@]{6,}@[^\s"'`<>]+/g;
  const code = /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(file.ext) ? stripComments(text) : text;
  let c;
  while ((c = connRe.exec(code)) !== null) {
    if (/(:password@|:pass@|user:pass|<password>|:changeme@|:example@)/i.test(c[0])) continue;
    out.push({
      rule: 'DB-CONNECTION-STRING',
      severity: file.isEnv ? 'high' : 'critical',
      title: 'Database connection string with an embedded password',
      file: file.rel, line: lineOf(code, c.index),
      evidence: c[0].replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@').slice(0, 70),
      why: 'This grants direct database access, bypassing every application-level check and every Row Level Security policy.',
      fix: 'Move it to a server-only environment variable and rotate the database password.',
      confidence: 'high',
    });
  }
  return out;
}

/** Cross-file pass: tables created but never protected. */
function finalize(ctx) {
  const out = [];
  if (!ctx.sql) return out;
  const SYSTEM = /^(schema_migrations|supabase_migrations|_prisma|knex_|pg_|audit_log_entries|flow_state|refresh_tokens|sessions|users|identities|instances|mfa_|saml_|sso_|one_time_tokens)/;
  for (const [table, where] of ctx.sql.created) {
    if (ctx.sql.rlsOn.has(table)) continue;
    if (SYSTEM.test(table)) continue;
    out.push({
      rule: 'DB-RLS-NOT-ENABLED',
      severity: 'critical',
      title: `Table "${table}" has no Row Level Security`,
      file: where.file, line: where.line, evidence: `create table ${table} … (no "enable row level security" found)`,
      why: 'Supabase exposes every table in the public schema over a REST endpoint. Without Row Level Security, anyone holding your anon key, which ships in your frontend, can read and write this table.',
      fix: `Run: alter table public.${table} enable row level security;  then add a policy that matches rows to their owner, for example: create policy "own rows" on public.${table} for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);`,
      confidence: 'medium',
      note: 'Detected from your migration files. If Row Level Security was enabled from the dashboard instead, confirm it there.',
    });
  }
  return out;
}

module.exports = { run, finalize, id: 'database' };
