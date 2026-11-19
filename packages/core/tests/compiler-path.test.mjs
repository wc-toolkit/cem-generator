import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { createProgramFromTsConfig, generateCem } from "../dist/index.js";
import { resolveCompilerPath } from "@wc-toolkit/cem-generator-utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");
const require = createRequire(import.meta.url);

function bundledCompiler() {
  const typescriptRequire = createRequire(require.resolve("typescript/package.json"));
  const packageJson = typescriptRequire.resolve(
    `@typescript/typescript-${process.platform}-${process.arch}/package.json`,
  );
  return path.join(path.dirname(packageJson), "lib", "tsc");
}

function tsrsCompiler() {
  const previous = process.env.CEM_GENERATOR_COMPILER;
  delete process.env.CEM_GENERATOR_COMPILER;
  try {
    const resolved = resolveCompilerPath();
    if (!resolved || !resolved.includes(`${path.sep}tsrs${path.sep}`)) return undefined;
    return resolved;
  } finally {
    if (previous !== undefined) process.env.CEM_GENERATOR_COMPILER = previous;
  }
}

/** A compiler that records each launch, then execs the given real compiler. */
function createRecordingCompiler(target) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cem-compiler-path-"));
  const log = path.join(directory, "launches.log");
  const script = path.join(directory, "recording-compiler");
  fs.writeFileSync(script, `#!/bin/sh\necho launched >> "${log}"\nexec "${target}" "$@"\n`);
  fs.chmodSync(script, 0o755);
  return {
    script,
    launches: () =>
      fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").length : 0,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

const posixOnly = { skip: process.platform === "win32" && "uses a shell script as the compiler" };

test("a missing compiler executable fails with a clear message", () => {
  assert.throws(
    () => generateCem({ tsConfigPath: fixturesTsConfig, compilerPath: "/nonexistent/compiler" }),
    /Compiler executable not found: \/nonexistent\/compiler/,
  );
});

test(
  "the default compiler is tsrs when it is installed",
  { ...posixOnly, skip: !tsrsCompiler() && "tsrs is not installed" },
  () => {
    const tsrs = tsrsCompiler();
    assert.ok(tsrs);
    assert.ok(fs.existsSync(tsrs));
    const include = ["standard-tags-element.js"];
    const expected = generateCem({ tsConfigPath: fixturesTsConfig, include });
    const actual = generateCem({
      tsConfigPath: fixturesTsConfig,
      include,
      compilerPath: bundledCompiler(),
    });
    assert.deepEqual(actual, expected);
  },
);

test(
  "compilerPath selects an override compiler and does not change the manifest",
  posixOnly,
  () => {
    const compiler = createRecordingCompiler(bundledCompiler());
    try {
      const include = ["standard-tags-element.js"];
      const expected = generateCem({ tsConfigPath: fixturesTsConfig, include });

      const actual = generateCem({
        tsConfigPath: fixturesTsConfig,
        include,
        compilerPath: compiler.script,
      });
      assert.deepEqual(actual, expected);
      assert.equal(compiler.launches(), 1);
    } finally {
      compiler.cleanup();
    }
  },
);

test(
  "CEM_GENERATOR_COMPILER selects an override compiler when no option is given",
  posixOnly,
  () => {
    const compiler = createRecordingCompiler(bundledCompiler());
    const previous = process.env.CEM_GENERATOR_COMPILER;
    process.env.CEM_GENERATOR_COMPILER = compiler.script;
    try {
      generateCem({ tsConfigPath: fixturesTsConfig, include: ["standard-tags-element.js"] });
      assert.equal(compiler.launches(), 1);
    } finally {
      if (previous === undefined) delete process.env.CEM_GENERATOR_COMPILER;
      else process.env.CEM_GENERATOR_COMPILER = previous;
      compiler.cleanup();
    }
  },
);

test("compilerPath takes precedence over CEM_GENERATOR_COMPILER", posixOnly, () => {
  const compiler = createRecordingCompiler(bundledCompiler());
  const previous = process.env.CEM_GENERATOR_COMPILER;
  process.env.CEM_GENERATOR_COMPILER = "/nonexistent/compiler";
  try {
    generateCem({
      tsConfigPath: fixturesTsConfig,
      include: ["standard-tags-element.js"],
      compilerPath: compiler.script,
    });
    assert.equal(compiler.launches(), 1);
  } finally {
    if (previous === undefined) delete process.env.CEM_GENERATOR_COMPILER;
    else process.env.CEM_GENERATOR_COMPILER = previous;
    compiler.cleanup();
  }
});

test("helpers that parse documentation snippets use the same compiler", posixOnly, () => {
  const compiler = createRecordingCompiler(bundledCompiler());
  try {
    const manifest = generateCem({
      tsConfigPath: fixturesTsConfig,
      include: ["css-only.css"],
      compilerPath: compiler.script,
    });
    assert.ok(manifest.modules.length > 0);
    // One client for the program and one for the CSS documentation snippets.
    assert.equal(compiler.launches(), 2);
  } finally {
    compiler.cleanup();
  }
});

test("createProgramFromTsConfig accepts a compiler path", posixOnly, () => {
  const compiler = createRecordingCompiler(bundledCompiler());
  try {
    const result = createProgramFromTsConfig({
      tsConfigPath: fixturesTsConfig,
      compilerPath: compiler.script,
    });
    try {
      assert.ok(result.sourceFiles.length > 0);
      assert.equal(compiler.launches(), 1);
    } finally {
      result.dispose();
    }
  } finally {
    compiler.cleanup();
  }
});
