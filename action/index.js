/* GitHub Action entry point. Runs the same scanner as the CLI, writes the
   summary into the job page, and fails the build at the chosen threshold.
   No dependencies, nothing downloaded at run time. */
'use strict';
const fs = require('fs');
const path = require('path');
const { scan } = require('../lib/scan');

const inp = (name, dflt) => process.env['INPUT_' + name.toUpperCase().replace(/ /g, '_')] || dflt;
const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function setOutput(name, value) {
  const f = process.env.GITHUB_OUTPUT;
  if (f) fs.appendFileSync(f, `${name}=${value}\n`);
}

function summary(md) {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) fs.appendFileSync(f, md + '\n');
}

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const target = path.resolve(workspace, inp('path', '.'));
const threshold = String(inp('fail-on', 'high')).toLowerCase();
const limit = ORDER[threshold] !== undefined ? ORDER[threshold] : 1;

let report;
try {
  report = scan(target);
} catch (e) {
  console.log('::error::vibeproof could not scan ' + target + ': ' + e.message);
  process.exit(2);
}

const reportPath = inp('report', '');
if (reportPath) {
  fs.writeFileSync(path.resolve(workspace, reportPath), JSON.stringify(report, null, 2));
}

setOutput('critical', report.counts.critical || 0);
setOutput('high', report.counts.high || 0);
setOutput('total', report.total);

// One annotation per finding, anchored to the file and line, so it shows up
// inline on the pull request diff.
for (const f of report.findings) {
  const level = ORDER[f.severity] <= 1 ? 'error' : 'warning';
  const msg = `${f.why} Fix: ${f.fix}`.replace(/\r?\n/g, ' ').slice(0, 900);
  console.log(`::${level} file=${f.file},line=${f.line},title=${f.title.replace(/[,\n]/g, ' ')}::${msg}`);
}

const rows = report.findings.map(f =>
  `| ${f.severity} | ${f.title} | \`${f.file}:${f.line}\` |`).join('\n');

summary([
  '## vibeproof',
  '',
  `${report.files_scanned} files scanned${report.stack.length ? ' · ' + report.stack.join(', ') : ''}`,
  '',
  report.total === 0
    ? '**No issues found by these checks.** This is not a security certification: it means the specific mistakes vibeproof looks for are not present.'
    : `**${report.counts.critical || 0} critical · ${report.counts.high || 0} high · ${report.counts.medium || 0} medium · ${report.counts.low || 0} low**`,
  '',
  report.total ? '| Severity | Finding | Where |\n|---|---|---|\n' + rows : '',
  '',
  report.counts.critical ? '> Rotate any exposed key before anything else. Deleting the line does not help: the old value stays in git history.\n' : '',
  '',
  '<sub>[vibeproof](https://github.com/humora2504/vibeproof) · MIT</sub>',
].join('\n'));

const blocking = report.findings.filter(f => ORDER[f.severity] <= limit);
if (blocking.length) {
  console.log(`::error::vibeproof found ${blocking.length} finding(s) at or above "${threshold}".`);
  process.exit(1);
}
console.log(`vibeproof: nothing at or above "${threshold}".`);
