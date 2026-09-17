# A key is in your repository. What to do, in order.

Deleting the line does nothing on its own. The value stays in git history, in
every clone, in every fork, and in any build log that printed it. Treat the
credential as public from the moment it was committed and replace it.

## 1. Rotate first, tidy up later

Rotate before you clean the history. Cleaning first only tells an attacker
which value mattered.

| Credential | Where to rotate | What breaks while you do it |
|---|---|---|
| Supabase `service_role` | Dashboard, Settings, API, Reset service key | Server code using the old key, until you redeploy |
| Supabase `anon` | Same screen, Reset anon key | Every client build, until redeployed. Rotate this one only if you must: it is public by design |
| Stripe secret key | Dashboard, Developers, API keys, Roll key | Payments, for the seconds between roll and deploy |
| OpenAI / Anthropic | Provider console, revoke then create | Any request using the old key |
| AWS access key | IAM, deactivate, create new, delete old | Anything using the old pair |
| Database password | Provider console, reset | Every connection string |
| OAuth client secret | Provider console, regenerate | Sign-in, until redeployed |

## 2. Check what was done with it

Rotation stops future use. It does not tell you what already happened.

- Supabase: Logs, then filter by the time window since the commit. Look for
  reads of tables the anon role should never touch.
- Stripe: Developers, Logs. Filter by API key. Look for refunds, payouts and
  customer reads you did not make.
- Cloud provider: billing first. Crypto mining shows up on the invoice before
  it shows up anywhere else.

## 3. Then clean the history

```bash
# Confirm what git is actually tracking
git ls-files | grep -E '^\.env'

# Stop tracking it, keep your local copy
git rm --cached .env
printf '.env\n.env*.local\n' >> .gitignore
git commit -m "stop tracking env file"
```

Rewriting history on a public repository is rarely worth it: assume forks
already have the old commit. On a private repository with a small team,
`git filter-repo --invert-paths --path .env` followed by a force push is
reasonable. Everyone must re-clone afterwards.

## 4. Stop it recurring

Add the CI gate from `ci.yml`. A key that cannot be merged cannot leak.
