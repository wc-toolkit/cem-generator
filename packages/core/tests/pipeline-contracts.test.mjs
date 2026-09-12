import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../dist/pipeline.js";
import { validateGeneratedManifest } from "../dist/validation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

function makeSourceFile(fileName, sourceText = "") {
  return {
    fileName,
    getFullText() {
      return sourceText;
    },
  };
}

function makeProgramResult(sourceFiles) {
  return {
    program: {},
    checker: {},
    sourceFiles,
    programResult: { program: {}, checker: {}, sourceFiles },
  };
}

function getClass(manifest, moduleSuffix, className) {
  const moduleDoc = manifest.modules.find((m) => m.path.endsWith(moduleSuffix));
  return moduleDoc?.declarations?.find((d) => d.name === className);
}

test("shouldAnalyze() is evaluated once per plugin per file", () => {
  let shouldAnalyzeCalls = 0;

  const detector = {
    name: "should-analyze-once",
    shouldAnalyze() {
      shouldAnalyzeCalls += 1;
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", fromOnFile: true } };
    },
  };

  generateCem({ tsConfigPath: fixturesTsConfig, include: ["inheritance-fixture.ts"], plugins: [detector] });

  assert.equal(shouldAnalyzeCalls, 1);
});

test("detectors without shouldAnalyze analyze files by default", () => {
  const detector = {
    name: "always-analyze",
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-a" } };
    },
  };

  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["inheritance-fixture.ts"],
    plugins: [detector],
  });

  assert.equal(getClass(manifest, "inheritance-fixture.ts", "ElA")?.tagName, "x-a");
});

test("detector conflicts can throw when explicitly configured", () => {
  const first = {
    name: "first",
    shouldAnalyze() {
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-a" } };
    },
  };

  const second = {
    name: "second",
    shouldAnalyze() {
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-b" } };
    },
  };

  assert.throws(
    () => generateCem({ tsConfigPath: fixturesTsConfig, plugins: [first, second], conflictPolicy: "throw" }),
    /Detector conflict/
  );
});

test("detector conflicts use last-wins by default", () => {
  const first = {
    name: "first",
    shouldAnalyze() {
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-a" } };
    },
  };

  const second = {
    name: "second",
    shouldAnalyze() {
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-b" } };
    },
  };

  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, include: ["inheritance-fixture.ts"], plugins: [first, second] });
  const elA = getClass(manifest, "inheritance-fixture.ts", "ElA");
  assert.equal(elA?.tagName, "x-b");
});

test("afterAllFiles patch can target module+class declaration", () => {
  const detector = {
    name: "cross-file",
    shouldAnalyze() {
      return true;
    },
    onFile(context) {
      if (context.filePath.endsWith("inheritance-fixture.ts")) {
        return { Shared: { name: "Shared", module: context.filePath } };
      }
      if (context.filePath.endsWith("parsed-types-element.ts")) {
        return { Shared: { name: "Shared", module: context.filePath } };
      }
      return {};
    },
    afterAllFiles(manifest) {
      const a = manifest.modules.find((m) => m.path.endsWith("inheritance-fixture.ts"));
      const b = manifest.modules.find((m) => m.path.endsWith("parsed-types-element.ts"));
      return {
        byDeclaration: {
          [`${a?.path ?? "a.ts"}#Shared`]: { onlyA: true },
          [`${b?.path ?? "b.ts"}#Shared`]: { onlyB: true },
        },
      };
    },
  };

  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, include: ["inheritance-fixture.ts", "parsed-types-element.ts"], plugins: [detector] });

  const aDecl = getClass(manifest, "inheritance-fixture.ts", "Shared");
  const bDecl = getClass(manifest, "parsed-types-element.ts", "Shared");

  assert.equal(aDecl?.onlyA, true);
  assert.equal(aDecl?.onlyB, undefined);
  assert.equal(bDecl?.onlyB, true);
  assert.equal(bDecl?.onlyA, undefined);
});

test("annotator cannot overwrite existing fields", () => {
  const detector = {
    name: "base",
    shouldAnalyze() {
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-a" } };
    },
  };

  const annotator = {
    name: "bad-annotator",
    afterManifest() {
      return { ElA: { tagName: "x-overwrite" } };
    },
  };

  assert.throws(
    () => generateCem({ tsConfigPath: fixturesTsConfig, plugins: [detector, annotator] }),
    /attempted to overwrite existing field/
  );
});

test("afterGenerate receives the finalized CEM package after validation", () => {
  let outputManifest;

  const plugin = {
    name: "output-plugin",
    afterGenerate(manifest) {
      outputManifest = manifest;
    },
  };

  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["inheritance-fixture.ts"],
    plugins: [plugin],
  });

  assert.equal(outputManifest, manifest);
  assert.equal(outputManifest.schemaVersion, "2.1.0");
  assert.ok(outputManifest.modules[0].kind);
  assert.ok(Array.isArray(outputManifest.modules[0].exports));
});

test("exported-type validation rejects unexported local public types", () => {
  assert.throws(
    () => generateCem({
      tsConfigPath: fixturesTsConfig,
      include: ["parsed-types-element.ts"],
      validation: { exportTypes: "error" },
    }),
    (error) =>
      error?.name === "ManifestValidationError" &&
      error.failures.some((failure) => failure.message.includes('local type "Mode"'))
  );
});

test("exported-type warnings report failures without stopping generation", () => {
  const warnings = [];
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["parsed-types-element.ts"],
    validation: {
      exportTypes: "warning",
      onWarning(message) {
        warnings.push(message);
      },
    },
  });

  assert.ok(manifest.modules.length > 0);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.some((message) => message.includes('local type "Mode"')));
});

test("exported-type validation can be disabled", () => {
  assert.doesNotThrow(() =>
    generateCem({
      tsConfigPath: fixturesTsConfig,
      include: ["parsed-types-element.ts"],
      validation: { exportTypes: "off" },
    })
  );
});

test("manifest invariant validation rejects broken export references", () => {
  assert.throws(
    () =>
      validateGeneratedManifest(
        {
          schemaVersion: "2.1.0",
          modules: [
            {
              kind: "javascript-module",
              path: "dist/button.js",
              declarations: [],
              exports: [
                {
                  kind: "js",
                  name: "ButtonElement",
                  declaration: { name: "ButtonElement", module: "dist/button.js" },
                },
              ],
            },
          ],
        },
        { schemaVersion: "2.1.0", modules: [] },
        {},
        [],
        { invariants: "error" }
      ),
    (error) =>
      error?.name === "ManifestValidationError" &&
      error.failures.some((failure) => failure.message.includes("missing declaration"))
  );
});
