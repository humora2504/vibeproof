# vibeproof

**Pre-deploy security scan for apps built with AI coding tools.** Finds the
mistakes that leave Supabase and Firebase projects wide open, before your users
do.

```bash
npx github:humora2504/vibeproof .
```

No install, no signup, no network access. It reads your repository and prints
what is exposed, with the fix next to each finding.

---

## Why

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
- Realtime Database rules open to the world
- Storage buckets created public

**Credentials**
- Supabase `service_role` keys, decoded from the token rather than guessed at
- Stripe, OpenAI, Anthropic, AWS, Google, GitHub, Slack, SendGrid and Resend keys
- Secrets exposed through `NEXT_PUBLIC_`, `VITE_`, `EXPO_PUBLIC_` and friends
- Database connection strings with an embedded password
- Env files that git is tracking, and a `.gitignore` that does not exclude them

**Application**
- Admin database clients built in code that ships to the browser
- Endpoints and server actions that write without checking who is calling
- CORS wildcards combined with credentials
- Authentication bypass flags left switched on
- Session secrets that are empty or too short
- SQL built by joining strings

It deliberately does **not** flag your Supabase anon key. That one is meant to be
public; Row Level Security is what protects you, which is why this tool checks
that instead.

## Use it in CI

```yaml
- run: npx --yes github:humora2504/vibeproof . --fail-on high
```

Exits non-zero when anything at or above the threshold is found, so a leaked key
cannot be merged. A ready-made workflow is in the Fix Pack.

## Options

```
--json            machine-readable output
--fail-on <sev>   exit 1 at this severity or worse. Default: high
--quiet           summary only
--no-color        plain text
```

Reviewed a finding and it is fine? Put `// vibeproof-ignore` on the line above,
or `// vibeproof-ignore-file` anywhere in the file.

## What it is not

It is not a security audit or a certification. It checks a specific, common and
damaging set of mistakes. A clean result means those mistakes are not present in
the files it could read. It does not mean you are secure.

## Fixing what it finds

Every finding prints its own fix. If you would rather have the policies written
for your own schema, with a script that proves an anonymous visitor and the wrong
logged-in user are actually refused, there is a paid Fix Pack:

**<https://humora2504.github.io/vibeproof/>**

The scanner stays free and MIT-licensed regardless.

## Tests

```bash
node test/run.js
```

26 assertions over a deliberately vulnerable fixture and a correctly built one.
The clean fixture must produce zero findings: false positives are treated as bugs.

## Licence

MIT. See [LICENSE](LICENSE).
