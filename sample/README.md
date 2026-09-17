# What the $19 Fix Pack actually produces

There are no customers yet, so there is no case study to show you. Instead, here
is the real output of the paid generator, run over a representative multi-tenant
schema, published in full so you can judge it before paying anything.

- [`schema/`](schema/supabase/migrations/001_schema.sql) — the input: nine tables,
  a membership table, one table already protected and one policy that looks
  protective and is not
- [`output/REPORT.md`](output/REPORT.md) — what it found, what it assumed, what it
  refuses to guess
- [`output/rls_policies.sql`](output/rls_policies.sql) — the policies, in one transaction
- [`output/rls_tests.mjs`](output/rls_tests.mjs) — the proof script
- [`output/ci.yml`](output/ci.yml) — the gate that stops it regressing
- [`output/playbooks/`](output/playbooks/) — one of the four runbooks in full, so you can judge the writing; the other three come with the pack

## Three things worth looking at

**It found the membership model rather than inventing one.** `org_members` links
`user_id` to `org_id`, so the organisation-owned tables use that table by name.
If no membership table had existed, those tables would be set to deny everything
instead, because SQL that grants the wrong people access is worse than SQL that
grants nobody access.

**It refuses to guess.** `organizations` and `plans` have no owner column, so the
report lists them under "decide these yourself" and the generated policy denies
everything until you replace it. That will break reads until you do. That is the
intended behaviour, and the report says so.

**It leaves your policies alone.** The sample schema has a `read all events`
policy that passes for everyone. The generator does not delete it: it lists it as
a comment, flags that it passes for everyone, and explains that policies combine
with OR so a permissive one still grants access. Deleting a policy you wrote
deliberately is not the generator's call.

## Regenerate it yourself

The generator is the paid half and is not in this repository, so this sample is
what it produces. If you own it:

```bash
node sample/build-sample.js
```

## What it does not do

It does not review your application logic, your dependencies or your
infrastructure, and it is not a security certification. It fixes who can reach
your tables and your storage. The free scanner finds the problems; this writes and
proves the fix.
