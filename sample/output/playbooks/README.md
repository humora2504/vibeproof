# Playbooks

One of the four is published in full so you can judge the writing and the depth:

- **[01-rotate-a-leaked-key.md](01-rotate-a-leaked-key.md)** — what to do, in what order, when a credential is already
  in your git history. Published in full.

The other three come with the pack:

- **02-lock-down-storage.md** — what public really means on a bucket, the policies
  that make a private one usable, and how to confirm from outside that a known
  object path no longer serves.
- **03-harden-server-actions.md** — why a server action is a public endpoint, the
  three checks in order, and the two things that look like authentication and are
  not.
- **04-first-hour-after-a-leak.md** — a timed runbook for the first sixty minutes,
  ordered so each step cannot be undone by what an attacker does while you work.
