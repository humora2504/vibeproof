# vibeproof Fix Pack report

Generated 2026-09-17 16:51 from supabase/migrations/001_schema.sql

## Tables found: 9

Membership model found: a user in `org_members` links `user_id` to `org_id`. Organisation-owned tables use it.

| Table | Row Level Security today | Owner column | Confidence |
|---|---|---|---|
| profiles | **off** | id | high |
| organizations | **off** | none found | low |
| org_members | **off** | user_id | high |
| projects | **off** | org_id | medium |
| api_keys | **off** | org_id | medium |
| invoices | **off** | org_id | medium |
| notes | **off** | user_id | high |
| plans | **off** | none found | low |
| events | on | user_id | medium |

## Apply it

1. Read `rls_policies.sql`. It adds policies and leaves yours in place, listing them as comments to review.
2. Run it against a branch or a copy first:
   ```
   psql "$DATABASE_URL" -f rls_policies.sql
   ```
   Your existing policies are left in place and listed as comments to review. Policies
   combine with OR, so a permissive one still grants access until you drop it.
3. Prove it:
   ```
   npm i @supabase/supabase-js
   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node rls_tests.mjs
   ```
   Every table should report that the anonymous visitor and the wrong user were refused,
   and that the owner can still read their own row.
4. Copy `ci.yml` to `.github/workflows/vibeproof.yml` so it cannot regress.

## Decide these yourself

No column in these tables identifies an owner, so the generated policy denies
everything. That is the safe default, and it will break reads until you replace it.

- **organizations** — columns: id, name, plan, created_at
- **plans** — columns: code, monthly_cents, seats

For reference data everyone may read, replace the deny-all policy with:
```sql
create policy "public read" on public.<table> for select to anon, authenticated using ( true );
grant select on public.<table> to anon;
```

## Worth a second look

These were matched by column name rather than by a foreign key to auth.users.
The policy is almost certainly right; confirm the column really holds the owner.

- **projects** — assumed owner column `org_id` (Column org_id points at an organisation, so access is decided by membership.)
- **api_keys** — assumed owner column `org_id` (Column org_id points at an organisation, so access is decided by membership.)
- **invoices** — assumed owner column `org_id` (Column org_id points at an organisation, so access is decided by membership.)
- **events** — assumed owner column `user_id` (Column user_id names a user and is the usual ownership column.)

## What this does not cover

This pack fixes access to your tables and storage. It does not review your
application logic, your dependencies or your infrastructure, and it is not a
security certification. Run the free scanner as well, on every change:

```
npx github:humora2504/vibeproof .
```
