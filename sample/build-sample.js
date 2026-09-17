#!/usr/bin/env node
// Regenerates the published sample so it can never drift from the real generator.
// The Fix Pack itself is not in this repository; this runs it from its source
// checkout when present, which is how the maintainer regenerates the sample.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const gen = path.resolve(__dirname, '..', '..', 'fixpack', 'vibeproof-fix.js');
if (!fs.existsSync(gen)) {
  console.error('The Fix Pack generator is not in this checkout. The published sample in');
  console.error('sample/output/ is what it produces; this script only regenerates it.');
  process.exit(0);
}
const out = path.join(__dirname, 'output');
fs.rmSync(out, { recursive: true, force: true });
execFileSync('node', [gen, path.join(__dirname, 'schema'), '--out', out], { stdio: 'inherit' });

// One playbook is published in full as a quality sample. The other three come
// with the pack, so they are replaced here by a description of what they cover.
const pb = path.join(out, 'playbooks');
const KEEP = '01-rotate-a-leaked-key.md';
for (const f of fs.readdirSync(pb)) if (f !== KEEP) fs.rmSync(path.join(pb, f));
fs.writeFileSync(path.join(pb, 'README.md'), `# Playbooks

One of the four is published in full so you can judge the writing and the depth:

- **[${KEEP}](${KEEP})** — what to do, in what order, when a credential is already
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
`);
console.log('sample regenerated in sample/output/');
