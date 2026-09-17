#!/usr/bin/env node
'use strict';
const path = require('path');
const { scan } = require('../lib/scan');

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const target = argv.find(a => !a.startsWith('-')) || '.';
const ESC = String.fromCharCode(27);

if (has('--help') || has('-h')) {
  console.log([
    '',
    'vibeproof - pre-deploy security scan for AI-built apps',
    '',
    '  npx github:humora2504/vibeproof            scan the current directory',
    '  npx github:humora2504/vibeproof ./my-app   scan a path',
    '',
    'Options',
    '  --json            machine-readable output',
    '  --fail-on <sev>   exit 1 at this severity or worse (critical|high|medium|low)',
    '                    default: high. Use it in CI to block a deploy.',
    '  --quiet           only show the summary',
    '  --no-color        plain text',
    '  --version         print version',
    '',
    'Suppress a reviewed line with a  // vibeproof-ignore  comment, or a whole',
    'file with  // vibeproof-ignore-file . To skip whole directories, list them',
    'in a  .vibeproofignore  file, one path or glob per line.',
    ''].join('\n'));
  process.exit(0);
}
if (has('--version') || has('-v')) { console.log(require('../package.json').version); process.exit(0); }

const useColor = !has('--no-color') && process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code, s) => useColor ? ESC + '[' + code + 'm' + s + ESC + '[0m' : s;
const bold = s => c('1', s), dim = s => c('2', s);
const SEV = {
  critical: { label: 'CRITICAL', badge: '1;41;97', plain: '91' },
  high:     { label: 'HIGH    ', badge: '1;31',    plain: '31' },
  medium:   { label: 'MEDIUM  ', badge: '1;33',    plain: '33' },
  low:      { label: 'LOW     ', badge: '1;36',    plain: '36' },
};

let report;
try { report = scan(path.resolve(target)); }
catch (e) { console.error('vibeproof: could not scan ' + target + ' - ' + e.message); process.exit(2); }

if (has('--json')) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  const { counts, total, findings } = report;
  console.log('');
  console.log('  ' + bold('vibeproof') + dim('  v' + report.version));
  console.log(dim('  ' + report.files_scanned + ' files - ' + (report.stack.length ? report.stack.join(', ') : 'stack not detected') + ' - ' + report.duration_ms + 'ms'));
  console.log('');

  if (total === 0) {
    console.log('  ' + c('1;42;30', ' CLEAN ') + '  No issues found by these checks.');
    console.log(dim('  This is not a security certification. It means the specific mistakes'));
    console.log(dim('  vibeproof looks for are not present in the files it could read.'));
    console.log('');
  } else if (!has('--quiet')) {
    for (const f of findings) {
      const s = SEV[f.severity];
      console.log('  ' + c(s.badge, ' ' + s.label + ' ') + '  ' + bold(f.title));
      console.log('      ' + dim(f.file + ':' + f.line) + (f.evidence ? '  ' + dim('-> ' + f.evidence) : ''));
      console.log('      ' + f.why);
      console.log('      ' + c('32', 'Fix:') + ' ' + f.fix);
      if (f.note) console.log('      ' + dim('Note: ' + f.note));
      if (f.confidence === 'low') console.log('      ' + dim('Confidence: low - worth a look, may already be handled elsewhere.'));
      console.log('');
    }
  }

  if (total > 0) {
    const parts = [];
    for (const k of ['critical', 'high', 'medium', 'low']) if (counts[k]) parts.push(c(SEV[k].plain, counts[k] + ' ' + k));
    console.log('  ' + bold('Summary: ') + parts.join(dim(' - ')));
    console.log('');
    if (counts.critical) {
      console.log('  ' + c('91', bold('Rotate any exposed key before anything else.')));
      console.log(dim('  Deleting the line does not help: the old value stays in git history.'));
      console.log('');
    }
    console.log(dim('  Every finding above carries its fix. If you want the fixes generated for'));
    console.log(dim('  your own schema, with tests that prove the lockdown actually works:'));
    console.log('  ' + c('4;36', 'https://humora2504.github.io/vibeproof/'));
    console.log('');
  }
}

const order = { critical: 0, high: 1, medium: 2, low: 3 };
const idx = argv.indexOf('--fail-on');
const threshold = (idx !== -1 && argv[idx + 1]) ? argv[idx + 1] : 'high';
const limit = order[threshold] !== undefined ? order[threshold] : 1;
const blocking = report.findings.filter(f => order[f.severity] <= limit).length;
process.exit(blocking > 0 ? 1 : 0);
