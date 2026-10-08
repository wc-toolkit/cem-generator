import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "@typescript/typescript6";

import { generateCem } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "fixtures");
const fixturesTsConfig = path.join(fixturesDir, "tsconfig.json");
const programEntry = path.join(fixturesDir, "program-entry-element.ts");

function createProgram(rootNames) {
  const configFile = ts.readConfigFile(fixturesTsConfig, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, fixturesDir);
  return ts.createProgram({
    rootNames,
    options: {
      ...parsed.options,
      allowJs: true,
      checkJs: parsed.options.checkJs ?? false,
    },
  });
}

function getModuleSources(manifest) {
  return manifest.modules.map((module) => module.source);
}

function getTagNames(manifest) {
  return manifest.modules.flatMap((module) =>
    (module.declarations ?? []).map((declaration) => declaration.tagName).filter(Boolean),
  );
}

function getSourceBasenames(manifest) {
  return getModuleSources(manifest).map((source) => path.basename(source));
}

test("accepts a caller-built program limited to one file import closure", () => {
  const program = createProgram([programEntry]);
  const manifest = generateCem({
    program,
    tsConfigPath: fixturesTsConfig,
    modulePathResolver: { skip: true },
  });

  assert.deepEqual(getModuleSources(manifest), [
    "program-base-element.ts",
    "program-entry-element.ts",
  ]);
  assert.deepEqual(getTagNames(manifest), ["program-base-element", "program-entry-element"]);
});

test("caller-built program skips CSS-only directory discovery", () => {
  const previousCwd = process.cwd();
  try {
    process.chdir(fixturesDir);
    const program = createProgram([programEntry]);
    const manifest = generateCem({
      program,
      modulePathResolver: { skip: true },
    });

    assert.deepEqual(getSourceBasenames(manifest), [
      "program-base-element.ts",
      "program-entry-element.ts",
    ]);
    assert.deepEqual(getTagNames(manifest), ["program-base-element", "program-entry-element"]);
  } finally {
    process.chdir(previousCwd);
  }
});

test("reuses the same caller-built program across generateCem calls", () => {
  const program = createProgram([programEntry]);
  const options = {
    program,
    tsConfigPath: fixturesTsConfig,
    modulePathResolver: { skip: true },
  };

  assert.deepEqual(generateCem(options), generateCem(options));
});

test("caller-built whole-fixture program matches tsconfig-created program", () => {
  const configFile = ts.readConfigFile(fixturesTsConfig, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, fixturesDir);
  const program = createProgram(parsed.fileNames);
  const options = {
    tsConfigPath: fixturesTsConfig,
    include: ["*.js", "*.ts"],
    modulePathResolver: { skip: true },
  };

  assert.deepEqual(generateCem({ ...options, program }), generateCem(options));
});

test("rejects a program built with an incompatible TypeScript version", () => {
  const wrongProgram = {
    getSourceFiles() {
      return [{ kind: -1 }];
    },
  };

  assert.throws(
    () => generateCem({ program: wrongProgram }),
    /program was built with an incompatible TypeScript version.*@typescript\/typescript6/s,
  );
});

test("accepts an empty program built with compatible TypeScript", () => {
  assert.deepEqual(
    generateCem({
      program: ts.createProgram({ rootNames: [], options: {} }),
      include: ["no-such-file.ts"],
      modulePathResolver: { skip: true },
    }),
    {
      schemaVersion: "2.1.0",
      modules: [],
    },
  );
});
