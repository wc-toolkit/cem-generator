import crypto from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

/**
 * Measures one fixture against one build of the generator, in a fresh process, and prints a JSON
 * line. `bench/compare.mjs` runs this for both builds and alternates their order.
 */
const benchDirectory = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(
  process.env.BENCH_ENTRY ?? path.join(benchDirectory, "../dist/index.js"),
);
const tsConfigPath = process.env.BENCH_FIXTURE;
const iterations = Number(process.env.BENCH_ITERATIONS ?? 7);

if (!tsConfigPath) throw new Error("BENCH_FIXTURE must point at a fixture tsconfig.json");

const { generateCem } = await import(pathToFileURL(entry).href);
const require = createRequire(entry);
const typescript = require(require.resolve("typescript/package.json")).version;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const coldStart = performance.now();
const first = generateCem({ tsConfigPath });
const coldMs = performance.now() - coldStart;

const timings = [];
for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  generateCem({ tsConfigPath });
  timings.push(performance.now() - start);
}

const json = JSON.stringify(first);
const manifestSha256 = crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);

console.log(
  JSON.stringify({
    entry,
    typescript,
    node: process.version,
    fixture: tsConfigPath,
    iterations,
    coldMs: Number(coldMs.toFixed(1)),
    medianMs: Number(median(timings).toFixed(1)),
    minMs: Number(Math.min(...timings).toFixed(1)),
    maxMs: Number(Math.max(...timings).toFixed(1)),
    timings: timings.map((value) => Number(value.toFixed(1))),
    modules: first.modules.length,
    declarations: first.modules.reduce(
      (total, module) => total + (module.declarations?.length ?? 0),
      0,
    ),
    manifestBytes: json.length,
    manifestSha256,
  }),
);
