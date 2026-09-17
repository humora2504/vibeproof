# The first hour after you find out

Work in this order. Each step is chosen so the next one cannot be undone by
what an attacker is doing while you work.

## Minute 0 to 10

1. Rotate the most powerful credential first: `service_role`, then the
   database password, then payment keys. Full list in playbook 01.
2. Do not delete anything yet. Logs are how you find out what happened.

## Minute 10 to 30

3. Turn on Row Level Security everywhere it is off. `rls_policies.sql` does
   this in one transaction. If you are unsure about a table, the generated
   deny-all policy is the right temporary answer: an app that errors is
   better than a database that leaks.
4. Revoke privileges from `anon` on anything that is not deliberately public.

## Minute 30 to 60

5. Read the logs for the window between the commit and the rotation. You are
   looking for bulk reads, unfamiliar addresses and writes you cannot explain.
6. Run `node rls_tests.mjs`. Do not rely on the dashboard showing a green
   shield: confirm from outside that an anonymous client is refused.

## Afterwards

7. If personal data was reachable, check whether you have a notification duty.
   Under the GDPR a controller has 72 hours from becoming aware of a personal
   data breach to notify the supervisory authority, unless the breach is
   unlikely to result in a risk to people's rights (Article 33). If the risk to
   individuals is high, they must be told too (Article 34). This is a pointer to
   the relevant articles, not legal advice; the assessment depends on your
   situation, so take advice on it.
8. Add the CI gate so the same mistake cannot be merged again.
