#!/usr/bin/env node
// Fills the fabricated credentials into a temporary .env, runs the scanner over
// the demo project, writes expected-output.txt, then removes the .env again.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, 'insecure-app');
const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const FAKE = {
  __SERVICE_JWT__: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
                    b64url({ role: 'service_role', iss: 'supabase', ref: 'demoproject' }),
                    'demosignature'].join('.'),
  __DB_PASSWORD__: 'demoOnlyPassw0rd',
};
let env = fs.readFileSync(path.join(dir, 'env.fixture'), 'utf8');
for (const [k, v] of Object.entries(FAKE)) env = env.split(k).join(v);
const envPath = path.join(dir, '.env');
fs.writeFileSync(envPath, env);

let out = '';
try {
  out = execFileSync('node', [path.join(__dirname, '..', 'bin', 'vibeproof.js'), dir, '--no-color'],
                     { encoding: 'utf8' });
} catch (e) {
  out = e.stdout || '';           // a non-zero exit is the expected result here
} finally {
  try { fs.unlinkSync(envPath); } catch {}
}
out = out.split(dir).join('demo/insecure-app').replace(/ - \d+ms/g, ' - 0ms');
fs.writeFileSync(path.join(__dirname, 'expected-output.txt'), out);
process.stdout.write(out);
