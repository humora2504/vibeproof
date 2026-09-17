# vibeproof — Supabase security scanner

**Finds the tables anyone can read, and the keys anyone can see, before your
users do.** One command, no install, no signup, and it never touches the network.

```bash
npx github:humora2504/vibeproof .
```

[![tests](https://github.com/humora2504/vibeproof/actions/workflows/tests.yml/badge.svg)](https://github.com/humora2504/vibeproof/actions/workflows/tests.yml)
[![demo](https://github.com/humora2504/vibeproof/actions/workflows/demo.yml/badge.svg)](https://github.com/humora2504/vibeproof/actions/workflows/demo.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-green.svg)](LICENSE)

---

## See it work before you run it

There is a deliberately unprotected project in [`demo/`](demo/), written the way
an AI coding tool usually produces one: correct SQL, nothing protected. The
scanner runs against it on every push, so you can read a **real run** rather than
a screenshot:

**[Latest demo run →](https://github.com/humora2504/vibeproof/actions/workflows/demo.yml)**
· [committed output](demo/expected-output.txt)

```
  vibeproof  v1.0.0
  5 files - Supabase, Next.js

   CRITICAL   Supabase service_role key is committed to the repository
      .env:2  -> eyJhbG…ture (131 chars)
      The service_role key bypasses Row Level Security completely. Whoever holds
      it can read, change and delete every row in every table, whatever your
      policies say.
      Fix: Rotate it in the dashboard. Use it only in server code, never behind
      a NEXT_PUBLIC_ prefix.

   CRITICAL   Table "invoices" has no Row Level Security
      supabase/migrations/001_init.sql:6
      Supabase exposes every table in the public schema over a REST endpoint.
      Without Row Level Security, anyone holding your anon key, which ships in
      your frontend, can read and write this table.
      Fix: alter table public.invoices enable row level security;

  Summary: 7 critical - 3 high - 2 medium
```

Try it on the demo yourself:

```bash
git clone https://github.com/humora2504/vibeproof && cd vibeproof
node demo/run-demo.js
```

## What the paid half produces

No customers yet, so no case study. Instead the **full output of the paid
generator** is published in the open, run over a representative nine-table
multi-tenant schema: [`sample/`](sample/) — the input schema, the report, the
generated SQL and the proof script. Judge it before paying anything.

## Why this exists

An independent scan of 1,072 apps built with AI coding tools found security
flaws in [98% of them][sym], and 172 where anyone could delete data without
logging in. A separate audit of 50 apps found [Row Level Security disabled in
88%][aud] and secrets committed in 78%.

These are not exotic bugs. They are four or five mistakes, repeated.

[sym]: https://www.symbioticsec.ai/blog/we-scanned-1-072-vibe-coded-apps-98-had-security-flaws
[aud]: https://dev.to/rishabh_kumar_6d865c83a4d/i-audited-50-vibe-coded-apps-heres-what-broke-1pb6

## What it checks

**Database access**
- Tables created without Row Level Security, read from your migrations
- Policies that pass for everyone, such as `using (true)` granted to `anon`
- Write privileges granted straight to the anonymous role
- Firebase and Firestore rules that say `allow read, write: if true`
- Realtime Database rules open to the world, and storage buckets created public

**Credentials**
- Supabase `service_role` keys, decoded from the token rather than guessed at
- Stripe, OpenAI, Anthropic, AWS, Google, GitHub, Slack, SendGrid and Resend keys
- Secrets exposed through `NEXT_PUBLIC_`, `VITE_`, `EXPO_PUBLIC_` and friends
- Database connection strings with an embedded password
- Env files that git is tracking, and a `.gitignore` that does not exclude them

**Application**
- Admin database clients built in code that ships to the browser
- Endpoints and server actions that write without checking who is calling
- CORS wildcards combined with credentials, and auth bypass flags left on
- Session secrets that are empty or too short, and SQL built by joining strings

It deliberately does **not** flag your Supabase anon key. That one is meant to be
public; Row Level Security is what protects you, which is why this checks that
instead. A scanner that shouts about the anon key teaches you to ignore scanners.

## As a gate on every pull request

```yaml
- uses: humora2504/vibeproof@v1
  with:
    fail-on: high     # critical | high | medium | low
```

Findings land as annotations on the diff and the build fails, so a leaked key
cannot be merged.

## Options

```
--json            machine-readable output
--fail-on <sev>   exit 1 at this severity or worse. Default: high
--quiet           summary only
--no-color        plain text
```

Reviewed a finding and it is fine? Put `// vibeproof-ignore` on the line above,
or `// vibeproof-ignore-file` anywhere in the file. To skip whole directories,
list them in `.vibeproofignore`:

```
test/fixtures/
examples/**/insecure-*
```

## What is free and what is paid

| | Free scanner | Fix Pack, $19 once |
|---|---|---|
| Finds unprotected tables, permissive policies, exposed keys | yes | yes |
| Runs offline, sends nothing anywhere | yes | yes |
| Gate on every pull request | yes | yes |
| Policies generated for your own schema | no | yes |
| Script that proves anon and the wrong user are refused | no | yes |
| Rotation, storage and incident playbooks | no | yes |

## What it is not

Not a security audit and not a certification. It checks a specific, common and
damaging set of mistakes. A clean result means those mistakes are not present in
the files it could read. It does not mean you are secure.

## Tests

```bash
node test/run.js
```

29 assertions over a deliberately vulnerable fixture and a correctly built one.
The clean fixture must produce zero findings: false positives are treated as
bugs, because a scanner you learn to ignore protects nobody.

## Fixing what it finds

Every finding prints its own fix, and for most projects that is enough. If you
would rather have the policies generated for your own schema, plus a script that
creates two throwaway users and proves from outside that an anonymous visitor and
the wrong logged-in user are both refused, there is a **$19 Fix Pack**:

**<https://humora2504.github.io/vibeproof/>**

The scanner stays free and MIT licensed regardless.

## Guides

- [RLS Disabled in Public](https://humora2504.github.io/vibeproof/supabase-rls-disabled-in-public.html) — what the warning means and how bad it is
- [new row violates row-level security policy](https://humora2504.github.io/vibeproof/new-row-violates-row-level-security-policy.html) — the four causes in order
- [Supabase returns an empty array](https://humora2504.github.io/vibeproof/supabase-returns-empty-array.html) — why RLS fails silently
- [Is the anon key safe to expose?](https://humora2504.github.io/vibeproof/is-supabase-anon-key-safe-to-expose.html) — yes, conditionally

## Licence

MIT. See [LICENSE](LICENSE).
