import test from "node:test";
import assert from "node:assert/strict";

import { runPipeline } from "../dist/pipeline.js";

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
  };
}

function getClass(manifest, moduleSuffix, className) {
  const moduleDoc = manifest.modules.find((m) => m.path.endsWith(moduleSuffix));
  return moduleDoc.declarations.find((d) => d.name === className);
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

  runPipeline(makeProgramResult([makeSourceFile("/tmp/one.ts", "class ElA extends HTMLElement {}")]), {
    plugins: [detector],
  });

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
    () =>
      runPipeline(makeProgramResult([makeSourceFile("/tmp/one.ts")]), {
        plugins: [first, second],
      }),
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

  const manifest = runPipeline(makeProgramResult([makeSourceFile("/tmp/one.ts")]), {
    plugins: [first, second],
    detectorConflictPolicy: "last-wins",
  });

  assert.equal(getClass(manifest, "one.ts", "ElA").tagName, "x-b");
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
          [`${a.path}#Shared`]: { onlyA: true },
          [`${b.path}#Shared`]: { onlyB: true },
        },
      };
    },
  };

  const manifest = runPipeline(
    makeProgramResult([makeSourceFile("/tmp/a.ts"), makeSourceFile("/tmp/b.ts")]),
    { plugins: [detector] }
  );

  const aDecl = getClass(manifest, "a.ts", "Shared");
  const bDecl = getClass(manifest, "b.ts", "Shared");

  assert.equal(aDecl.onlyA, true);
  assert.equal(aDecl.onlyB, undefined);
  assert.equal(bDecl.onlyB, true);
  assert.equal(bDecl.onlyA, undefined);
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
    () =>
      runPipeline(makeProgramResult([makeSourceFile("/tmp/one.ts")]), {
        plugins: [detector, annotator],
      }),
    /attempted to overwrite existing field/
  );
});
