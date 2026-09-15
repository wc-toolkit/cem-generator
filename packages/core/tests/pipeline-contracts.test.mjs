import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../dist/pipeline.js";
import { validateGeneratedManifest } from "../dist/validation.js";
import ts from "typescript";
import { getParsedTypeText } from "../../core-utils/dist/index.js";
import { createProgramFromTsConfig } from "../dist/program.js";
import { detectClassMembers } from "../dist/api-members.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("uses project-relative module paths when no package exports are configured", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["inheritance-fixture.ts"],
  });

  assert.equal(manifest.modules[0].path, "inheritance-fixture.ts");
  assert.equal(path.isAbsolute(manifest.modules[0].path), false);
});

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

test("CSS-only custom elements require a JSDoc comment", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, include: ["css-only.css"] });
  const moduleDoc = manifest.modules.find((module) => module.path.endsWith("css-only.css"));
  const badge = moduleDoc?.declarations.find((declaration) => declaration.tagName === "my-badge");

  assert.equal(badge?.name, "my-badge");
  assert.match(badge?.description ?? "", /styled without a JavaScript definition/);
  assert.deepEqual(
    badge?.attributes?.map(({ name, description, type }) => ({ name, description, type })),
    [{ name: "variant", description: "Selects the badge style.", type: { text: '\"danger\" | \"success\"' } }]
  );
  assert.deepEqual(
    badge?.cssProperties?.map(({ name, default: value }) => [name, value]),
    [
      ["--badge-bg-color", "lightgray"],
      ["--badge-border-radius", "4px"],
      ["--badge-border-width", "1px"],
      ["--badge-fg-color", "black"],
      ["--badge-outline-color", undefined],
      ["--badge-padding", "8px"],
    ]
  );
  assert.equal(moduleDoc?.declarations.some((declaration) => declaration.tagName === "my-undocumented-element"), false);
  assert.equal(moduleDoc?.declarations.some((declaration) => declaration.tagName === "my-regular-comment-element"), false);
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
  assert.equal(warnings.length, 3);
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

test("parsed type expansion remains bounded for recursive types", () => {
  const fixturePath = path.resolve(__dirname, "fixtures/large-type.ts");
  const program = ts.createProgram([fixturePath], { strict: true, skipLibCheck: true });
  const sourceFile = program.getSourceFile(fixturePath);
  const checker = program.getTypeChecker();
  const declaration = sourceFile.statements.find(
    (statement) => ts.isVariableStatement(statement) && statement.declarationList.declarations[0]?.name.getText() === "largeValue",
  );
  const variable = declaration.declarationList.declarations[0];

  const parsed = getParsedTypeText(variable, checker);

  assert.ok(parsed);
  assert.ok(parsed.length < 100_000);
});

test("typeParsing none disables parsed type expansion", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["parsed-types-element.ts"],
    typeParsing: "none",
  });
  const declaration = manifest.modules.flatMap((module) => module.declarations)
    .find((item) => item.name === "ParsedTypesElement");

  assert.ok(declaration);
  assert.equal(declaration.members?.find((member) => member.name === "mode")?.parsedType, undefined);
  assert.equal(declaration.events?.find((event) => event.name === "payload-change")?.parsedType, undefined);
});

test("reuses class member analysis for the same declaration and checker", () => {
  const result = createProgramFromTsConfig(fixturesTsConfig);
  const sourceFile = result.sourceFiles.find((file) => file.fileName.endsWith("inheritance-fixture.ts"));
  const declaration = sourceFile.statements.find(
    (statement) => ts.isClassDeclaration(statement) && statement.name?.text === "BaseElement",
  );
  let typeLookups = 0;
  const checker = new Proxy(result.checker, {
    get(target, property) {
      const value = target[property];
      if (property === "getTypeAtLocation") {
        return (...args) => {
          typeLookups += 1;
          return value.apply(target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const context = {
    filePath: sourceFile.fileName,
    sourceText: sourceFile.getFullText(),
    sourceFile,
    checker,
  };

  detectClassMembers(declaration, context);
  const firstLookupCount = typeLookups;
  detectClassMembers(declaration, context);

  assert.ok(firstLookupCount > 0);
  assert.equal(typeLookups, firstLookupCount);
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
