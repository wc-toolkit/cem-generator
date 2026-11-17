import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { generateCem } from "../dist/index.js";

const require = createRequire(import.meta.url);
const tsVersion = require("typescript/package.json").version;

const sizes = (process.env.BENCH_SIZES ?? "50,200,500").split(",").map(Number);
const iterations = Number(process.env.BENCH_ITERATIONS ?? 5);

function writeFixture(root, count) {
  const srcDir = path.join(root, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          lib: ["ES2022", "DOM"],
          strict: true,
          experimentalDecorators: false,
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(srcDir, "base.ts"),
    `/** Shared base for bench elements. */
export class BenchBase extends HTMLElement {
  /** Shared disabled flag. */
  disabled = false;
  /** Shared size. */
  size: "small" | "large" = "small";
  /**
   * Fired when the base changes.
   * @fires {CustomEvent<string>} base-changed - Base changed
   */
  notify(detail: string): void {
    this.dispatchEvent(new CustomEvent("base-changed", { detail }));
  }
}
`,
  );
  const exportsList = [`export * from "./base.js";`];
  for (let i = 0; i < count; i++) {
    const name = `BenchComp${i}`;
    fs.writeFileSync(
      path.join(srcDir, `comp-${i}.ts`),
      `import { BenchBase } from "./base.js";

/**
 * Bench element ${i}.
 * @fires {CustomEvent<number>} item-changed - Fired when the item changes
 * @fires {CustomEvent<void>} item-reset - Fired on reset
 */
export class ${name} extends BenchBase {
  static observedAttributes = ["value", "label", "variant"];

  /** The numeric value. */
  value = ${i};

  /** The label text. */
  label: string = "item-${i}";

  /** Visual variant. */
  variant: "primary" | "secondary" | "ghost" = "primary";

  private _internal = ${i};

  #hidden = ${i * 2};

  /** Multiplies the value. @param factor The factor to apply. */
  scale(factor: number, round?: boolean): number {
    return round ? Math.round(this.value * factor) : this.value * factor;
  }

  /** Computed read/write property. */
  get computed(): number {
    return this.value * 2;
  }

  set computed(next: number) {
    this.value = next / 2;
  }

  reset(): void {
    this.value = ${i};
    this.dispatchEvent(new CustomEvent("item-reset"));
  }

  connectedCallback(): void {
    this._internal += 1;
  }
}

customElements.define("bench-comp-${i}", ${name});
`,
    );
    exportsList.push(`export * from "./comp-${i}.js";`);
  }
  fs.writeFileSync(path.join(srcDir, "index.ts"), `${exportsList.join("\n")}\n`);
  return path.join(root, "tsconfig.json");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmt(ms) {
  return `${ms.toFixed(1)} ms`;
}

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "cem-bench-"));
const results = [];

try {
  for (const count of sizes) {
    const root = path.join(tmpBase, `size-${count}`);
    const tsConfigPath = writeFixture(root, count);

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
    const digest = crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
    const result = {
      components: count,
      coldMs: Number(coldMs.toFixed(1)),
      medianMs: Number(median(timings).toFixed(1)),
      minMs: Number(Math.min(...timings).toFixed(1)),
      maxMs: Number(Math.max(...timings).toFixed(1)),
      declarations: first.modules.length,
      manifestBytes: json.length,
      manifestSha256: digest,
    };
    results.push(result);
    console.log(
      `${String(count).padStart(5)} components | cold ${fmt(coldMs)} | median ${fmt(result.medianMs)} | min ${fmt(result.minMs)} | max ${fmt(result.maxMs)} | sha ${digest}`,
    );
  }
} finally {
  fs.rmSync(tmpBase, { recursive: true, force: true });
}

const report = {
  typescript: tsVersion,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  iterations,
  generatedAt: new Date().toISOString(),
  results,
};

const outDir = process.env.BENCH_OUT_DIR;
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `cem-bench-ts-${tsVersion}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outFile}`);
}
