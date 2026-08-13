#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const METRIC_NAMES = ['statements', 'branches', 'functions', 'lines'];

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    summary: 'coverage/coverage-summary.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`${option} requires a value.`);

    if (option === '--root') options.root = value;
    else if (option === '--summary') options.summary = value;
    else throw new Error(`Unknown option: ${option}`);
    index += 1;
  }

  return options;
}

function emptyMetrics() {
  return Object.fromEntries(
    METRIC_NAMES.map((name) => [name, { covered: 0, pct: null, total: 0 }]),
  );
}

function addCoverage(target, source) {
  for (const name of METRIC_NAMES) {
    target[name].covered += source[name].covered;
    target[name].total += source[name].total;
  }
}

function finalizeMetrics(metrics) {
  for (const name of METRIC_NAMES) {
    const metric = metrics[name];
    metric.pct =
      metric.total === 0 ? null : Number(((metric.covered / metric.total) * 100).toFixed(2));
  }
  return metrics;
}

function normalizeMetrics(metrics) {
  finalizeMetrics(metrics);

  if (metrics.statements.total === 0 && metrics.lines.total === 0) {
    return emptyMetrics();
  }

  if (metrics.statements.covered === 0 && metrics.lines.covered === 0) {
    for (const name of ['branches', 'functions']) {
      metrics[name].covered = 0;
      metrics[name].pct = metrics[name].total === 0 ? null : 0;
    }
  }

  return metrics;
}

async function modulePaths(root) {
  const modules = [];

  for (const parent of ['apps', 'packages']) {
    let entries = [];
    try {
      entries = await readdir(join(root, parent), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        modules.push(`${parent}/${entry.name}`);
      }
    }
  }

  return modules.sort();
}

function moduleForFile(root, filePath) {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(root, filePath);
  const parts = relative(root, absolutePath).split(sep);
  if ((parts[0] === 'apps' || parts[0] === 'packages') && parts.length > 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return null;
}

async function readPrevious(path) {
  try {
    const text = await readFile(path, 'utf8');
    return { data: JSON.parse(text), text };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function formatPct(value) {
  return value === null ? 'n/a' : `${value.toFixed(2)}%`;
}

function formatDelta(current, previous) {
  if (current === null || previous === null || previous === undefined) return 'n/a';
  const delta = Number((current - previous).toFixed(2));
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}pp`;
}

export async function updateQualityBaselines({ root, summary }) {
  const resolvedRoot = resolve(root);
  const summaryPath = isAbsolute(summary) ? summary : resolve(resolvedRoot, summary);
  const report = JSON.parse(await readFile(summaryPath, 'utf8'));
  const modules = await modulePaths(resolvedRoot);
  const grouped = new Map(modules.map((module) => [module, { files: 0, metrics: emptyMetrics() }]));
  const changedBaselines = [];

  for (const [filePath, coverage] of Object.entries(report)) {
    if (filePath === 'total') continue;
    const module = moduleForFile(resolvedRoot, filePath);
    const target = module ? grouped.get(module) : null;
    if (!target) continue;
    target.files += 1;
    addCoverage(target.metrics, coverage);
  }

  console.log('\nModule coverage baselines');
  console.log(
    'Module'.padEnd(28),
    'Statements'.padStart(11),
    'Branches'.padStart(10),
    'Functions'.padStart(10),
    'Lines'.padStart(10),
    'Line delta'.padStart(11),
  );

  for (const module of modules) {
    const current = grouped.get(module);
    const metrics = normalizeMetrics(current.metrics);
    const hasMeasurableSource = metrics.statements.total > 0 || metrics.lines.total > 0;
    const baselinePath = join(resolvedRoot, module, '.quality-baseline/test-coverage.json');
    const previous = await readPrevious(baselinePath);
    const baseline = {
      schemaVersion: 1,
      module,
      command: 'npm run test',
      status: hasMeasurableSource ? 'measured' : 'no-measurable-source',
      files: current.files,
      coverage: metrics,
    };
    const serialized = `${JSON.stringify(baseline, null, 2)}\n`;
    if (previous?.text !== serialized) changedBaselines.push(relative(resolvedRoot, baselinePath));

    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, serialized);

    console.log(
      module.padEnd(28),
      formatPct(metrics.statements.pct).padStart(11),
      formatPct(metrics.branches.pct).padStart(10),
      formatPct(metrics.functions.pct).padStart(10),
      formatPct(metrics.lines.pct).padStart(10),
      formatDelta(metrics.lines.pct, previous?.data?.coverage?.lines?.pct).padStart(11),
    );
  }

  const overall = emptyMetrics();
  addCoverage(overall, report.total);
  normalizeMetrics(overall);
  console.log(
    'Overall'.padEnd(28),
    formatPct(overall.statements.pct).padStart(11),
    formatPct(overall.branches.pct).padStart(10),
    formatPct(overall.functions.pct).padStart(10),
    formatPct(overall.lines.pct).padStart(10),
    'n/a'.padStart(11),
  );

  if (process.env.CI && changedBaselines.length > 0) {
    throw new Error(
      `Coverage baselines are stale: ${changedBaselines.join(', ')}. Run npm run test and commit the updated files.`,
    );
  }

  return modules.map((module) => join(module, '.quality-baseline/test-coverage.json'));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  updateQualityBaselines(options).catch((error) => {
    console.error(`update-quality-baselines: ${error.message}`);
    process.exitCode = 1;
  });
}
