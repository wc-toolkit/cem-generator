import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../dist/pipeline.js";

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

test("claims() is evaluated once per plugin per file", () => {
  let claimsCalls = 0;

  const detector = {
    name: "claims-once",
    claims() {
      claimsCalls += 1;
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", fromOnFile: true } };
    },
    afterFile(_context, fragment) {
      return fragment;
    },
  };

  generateCem({ tsConfigPath: fixturesTsConfig, plugins: [detector] });

  assert.equal(claimsCalls, 1);
});

test("detector conflicts throw by default", () => {
  const first = {
    name: "first",
    claims() {
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-a" } };
    },
  };

  const second = {
    name: "second",
    claims() {
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-b" } };
    },
  };

  assert.throws(
    () => generateCem({ tsConfigPath: fixturesTsConfig, plugins: [first, second] }),
    /Detector conflict/
  );
});

test("detector conflicts can use last-wins policy", () => {
  const first = {
    name: "first",
    claims() {
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-a" } };
    },
  };

  const second = {
    name: "second",
    claims() {
      return true;
    },
    onFile() {
      return { ElA: { name: "ElA", tagName: "x-b" } };
    },
  };

  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [first, second], detectorConflictPolicy: "last-wins" });
  const elA = getClass(manifest, "one.ts", "ElA");
  assert.equal(elA?.tagName, "x-b");
});

test("afterAllFiles patch can target module+class declaration", () => {
  const detector = {
    name: "cross-file",
    claims() {
      return true;
    },
    onFile(context) {
      if (context.filePath.endsWith("a.ts")) {
        return { Shared: { name: "Shared", module: context.filePath } };
      }
      if (context.filePath.endsWith("b.ts")) {
        return { Shared: { name: "Shared", module: context.filePath } };
      }
      return {};
    },
    afterAllFiles(manifest) {
      const a = manifest.modules.find((m) => m.path.endsWith("a.ts"));
      const b = manifest.modules.find((m) => m.path.endsWith("b.ts"));
      return {
        byDeclaration: {
          [`${a?.path ?? "a.ts"}#Shared`]: { onlyA: true },
          [`${b?.path ?? "b.ts"}#Shared`]: { onlyB: true },
        },
      };
    },
  };

  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [detector] });

  const aDecl = getClass(manifest, "a.ts", "Shared");
  const bDecl = getClass(manifest, "b.ts", "Shared");

  assert.equal(aDecl?.onlyA, true);
  assert.equal(aDecl?.onlyB, undefined);
  assert.equal(bDecl?.onlyB, true);
  assert.equal(bDecl?.onlyA, undefined);
});

test("annotator cannot overwrite existing fields", () => {
  const detector = {
    name: "base",
    claims() {
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
