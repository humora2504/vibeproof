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
console.log('sample regenerated in sample/output/');
