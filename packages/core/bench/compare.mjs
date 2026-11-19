import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureFixtures } from "./fixtures.mjs";

/**
 * Runs `bench/measure.mjs` in fresh processes for two generator builds and alternates their
 * order between rounds, so neither build benefits from a warmer machine or page cache.
 *
 * Required: BENCH_BASELINE (entry file of the comparison build).
 * Optional: BENCH_CURRENT (default: this package's dist), BENCH_FIXTURES (comma separated),
 * BENCH_ITERATIONS, BENCH_ROUNDS, BENCH_FIXTURE_ROOT, BENCH_OUT_DIR.
 *
 * BENCH_BASELINE_COMPILER and BENCH_CURRENT_COMPILER set `CEM_GENERATOR_COMPILER` for one side
 * only, which compares compiler servers on the same build (point both sides at the same dist).
 */
const benchDirectory = path.dirname(fileURLToPath(import.meta.url));
const currentEntry = path.resolve(
  process.env.BENCH_CURRENT ?? path.join(benchDirectory, "../dist/index.js"),
);
const baselineEntry = process.env.BENCH_BASELINE
  ? path.resolve(process.env.BENCH_BASELINE)
  : undefined;

const iterations = Number(process.env.BENCH_ITERATIONS ?? 7);
const rounds = Number(process.env.BENCH_ROUNDS ?? 2);
const fixtureRoot =
  process.env.BENCH_FIXTURE_ROOT ?? path.join(os.tmpdir(), "opencode", "cem-perf-fixtures");
const measureScript = path.join(benchDirectory, "measure.mjs");

const entries = baselineEntry
  ? [
      {
        key: "baseline",
        entry: baselineEntry,
        compiler: process.env.BENCH_BASELINE_COMPILER,
      },
      { key: "current", entry: currentEntry, compiler: process.env.BENCH_CURRENT_COMPILER },
    ]
  : [{ key: "current", entry: currentEntry, compiler: process.env.BENCH_CURRENT_COMPILER }];

const requested = process.env.BENCH_FIXTURES?.split(",").map((name) => name.trim());
const fixtures = ensureFixtures(fixtureRoot, requested);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function measure(entry, tsConfigPath, compiler) {
  const output = execFileSync(process.execPath, [measureScript], {
    env: {
      ...process.env,
      ...(compiler ? { CEM_GENERATOR_COMPILER: path.resolve(compiler) } : {}),
      BENCH_ENTRY: entry,
      BENCH_FIXTURE: tsConfigPath,
      BENCH_ITERATIONS: String(iterations),
    },
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").filter(Boolean).at(-1));
}

const rows = [];
let hashesMatch = true;

for (const fixture of fixtures) {
  const samples = new Map(entries.map(({ key }) => [key, []]));
  const colds = new Map(entries.map(({ key }) => [key, []]));
  const latest = new Map();

  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? entries : [...entries].reverse();
    for (const { key, entry, compiler } of order) {
      const result = measure(entry, fixture.tsConfigPath, compiler);
      samples.get(key).push(...result.timings);
      colds.get(key).push(result.coldMs);
      latest.set(key, result);
    }
  }

  const results = {};
  for (const { key } of entries) {
    const result = latest.get(key);
    results[key] = {
      typescript: result.typescript,
      coldMs: Number(median(colds.get(key)).toFixed(1)),
      medianMs: Number(median(samples.get(key)).toFixed(1)),
      minMs: Math.min(...samples.get(key)),
      maxMs: Math.max(...samples.get(key)),
      declarations: result.declarations,
      manifestSha256: result.manifestSha256,
    };
  }

  if (baselineEntry && results.baseline.manifestSha256 !== results.current.manifestSha256) {
    hashesMatch = false;
  }

  rows.push({ fixture: fixture.name, results });
}

const names = {
  baseline: process.env.BENCH_BASELINE_LABEL ?? "baseline",
  current: process.env.BENCH_CURRENT_LABEL ?? "current",
};
const labels = new Map();
for (const { key } of entries) {
  const typescript = rows.find((row) => row.results[key])?.results[key].typescript;
  labels.set(key, `${names[key]} (TypeScript ${typescript})`);
}

const columns = entries.map(({ key }) => key);
const header = [
  "fixture".padEnd(16),
  ...columns.map((key) => `${labels.get(key)} median`.padEnd(34)),
  "change",
];
console.log(header.join("  "));

for (const row of rows) {
  const cells = [row.fixture.padEnd(16)];
  for (const key of columns) {
    const result = row.results[key];
    cells.push(`${result.medianMs} ms (cold ${result.coldMs} ms)`.padEnd(34));
  }
  if (columns.length === 2) {
    const [before, after] = columns.map((key) => row.results[key].medianMs);
    const change = ((after - before) / before) * 100;
    cells.push(`${change > 0 ? "+" : ""}${change.toFixed(0)}%`);
  } else {
    cells.push("");
  }
  cells.push(row.results.baseline ? `sha ${row.results.current.manifestSha256}` : "");
  console.log(cells.join("  "));
}

if (columns.length === 2) {
  const matching = rows.filter(
    (row) => row.results.baseline.manifestSha256 === row.results.current.manifestSha256,
  ).length;
  console.log(
    `\nmanifests identical: ${matching}/${rows.length}${hashesMatch ? "" : " — MISMATCH"}`,
  );
}

const outDir = process.env.BENCH_OUT_DIR;
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "cem-bench-compare.json");
  fs.writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        iterations,
        rounds,
        fixtureRoot,
        rows,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Wrote ${outFile}`);
}

if (!hashesMatch) process.exitCode = 1;
