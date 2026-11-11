import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem, generateCemWithProgram } from "../dist/pipeline.js";
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

test("reuses a previous program without changing output", () => {
  const first = generateCemWithProgram({ tsConfigPath: fixturesTsConfig });
  const second = generateCemWithProgram(
    { tsConfigPath: fixturesTsConfig },
    first.programResult.program,
  );
  assert.deepEqual(second.manifest, first.manifest);
});

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

  generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["inheritance-fixture.ts"],
    plugins: [detector],
  });

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
    [
      {
        name: "variant",
        description: "Selects the badge style.",
        type: { text: '"danger" | "success"' },
      },
    ],
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
    ],
  );
  assert.equal(
    moduleDoc?.declarations.some(
      (declaration) => declaration.tagName === "my-undocumented-element",
    ),
    false,
  );
  assert.equal(
    moduleDoc?.declarations.some(
      (declaration) => declaration.tagName === "my-regular-comment-element",
    ),
    false,
  );
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

test("untagged base classes are not inferred to be custom elements", () => {
  const detector = {
    name: "base-class-markers",
    onFile(context) {
      if (context.filePath.endsWith("parsed-types-element.ts")) {
        return { BaseClass: { name: "BaseClass", module: context.filePath } };
      }
      if (!context.filePath.endsWith("inheritance-fixture.ts")) return {};
      return {
        BaseClass: { name: "BaseClass", module: context.filePath },
        UnregisteredLeaf: {
          name: "UnregisteredLeaf",
          module: context.filePath,
          superclass: { name: "BaseClass", module: context.filePath },
        },
        RegisteredBase: {
          name: "RegisteredBase",
          module: context.filePath,
          tagName: "x-registered-base",
        },
        RegisteredChild: {
          name: "RegisteredChild",
          module: context.filePath,
          tagName: "x-registered-child",
          superclass: { name: "RegisteredBase" },
        },
        ExplicitBase: {
          name: "ExplicitBase",
          module: context.filePath,
          customElement: true,
        },
        ExplicitChild: {
          name: "ExplicitChild",
          module: context.filePath,
          superclass: { name: "ExplicitBase" },
        },
      };
    },
  };

  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["inheritance-fixture.ts", "parsed-types-element.ts"],
    plugins: [detector],
  });

  assert.equal(getClass(manifest, "inheritance-fixture.ts", "BaseClass")?.customElement, false);
  assert.equal(getClass(manifest, "parsed-types-element.ts", "BaseClass")?.customElement, true);
  assert.equal(
    getClass(manifest, "inheritance-fixture.ts", "UnregisteredLeaf")?.customElement,
    true,
  );
  assert.equal(getClass(manifest, "inheritance-fixture.ts", "RegisteredBase")?.customElement, true);
  assert.equal(getClass(manifest, "inheritance-fixture.ts", "ExplicitBase")?.customElement, true);
});

test("attribute types reflect linked member declarations", () => {
  const detector = {
    name: "declaration-links",
    onFile() {
      return {
        PlainClass: {
          name: "PlainClass",
          members: [
            { name: "variant", type: '"primary" | "secondary"', attribute: "variant" },
            { name: "density", type: '"compact" | "comfortable"', attribute: "density-level" },
          ],
          attributes: [
            { name: "variant", type: "string", fieldName: "variant" },
            { name: "density-level", type: "string" },
          ],
        },
      };
    },
  };

  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["inheritance-fixture.ts"],
    plugins: [detector],
  });
  const plainClass = getClass(manifest, "inheritance-fixture.ts", "PlainClass");

  assert.deepEqual(
    plainClass?.attributes?.map(({ name, type }) => [name, type?.text]),
    [
      ["density-level", '"compact" | "comfortable"'],
      ["variant", '"primary" | "secondary"'],
    ],
  );
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
    () =>
      generateCem({
        tsConfigPath: fixturesTsConfig,
        plugins: [first, second],
        conflictPolicy: "throw",
      }),
    /Detector conflict/,
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

  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["inheritance-fixture.ts"],
    plugins: [first, second],
  });
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

  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["inheritance-fixture.ts", "parsed-types-element.ts"],
    plugins: [detector],
  });

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
    /attempted to overwrite existing field/,
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
    () =>
      generateCem({
        tsConfigPath: fixturesTsConfig,
        include: ["parsed-types-element.ts"],
        validation: { exportTypes: "error" },
      }),
    (error) =>
      error?.name === "ManifestValidationError" &&
      error.failures.some((failure) => failure.message.includes('local type "Mode"')),
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
    }),
  );
});

test("parsed type expansion remains bounded for recursive types", () => {
  const fixturePath = path.resolve(__dirname, "fixtures/large-type.ts");
  const program = ts.createProgram([fixturePath], { strict: true, skipLibCheck: true });
  const sourceFile = program.getSourceFile(fixturePath);
  const checker = program.getTypeChecker();
  const declaration = sourceFile.statements.find(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations[0]?.name.getText() === "largeValue",
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
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "ParsedTypesElement");

  assert.ok(declaration);
  assert.equal(
    declaration.members?.find((member) => member.name === "mode")?.parsedType,
    undefined,
  );
  assert.equal(
    declaration.events?.find((event) => event.name === "payload-change")?.parsedType,
    undefined,
  );
});

test("getter-only class members are readonly fields", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["accessor-members.js"],
  });
  const cases = [
    {
      className: "AccessorMembers",
      memberName: "label",
      readonly: true,
      inheritedFrom: undefined,
    },
    {
      className: "AccessorMembers",
      memberName: "value",
      readonly: undefined,
      inheritedFrom: undefined,
    },
    {
      className: "AccessorInheritsGetter",
      memberName: "inheritedGetterOnly",
      readonly: true,
      inheritedFrom: "AccessorBase",
    },
    {
      className: "AccessorOverridesGetter",
      memberName: "overridePair",
      readonly: true,
      inheritedFrom: undefined,
    },
    {
      className: "AccessorOverridesSetter",
      memberName: "setterOverride",
      readonly: undefined,
      inheritedFrom: undefined,
    },
    {
      className: "AccessorInheritsPair",
      memberName: "inheritedPair",
      readonly: undefined,
      inheritedFrom: "AccessorBase",
    },
  ];

  for (const expected of cases) {
    const declaration = getClass(manifest, "accessor-members.js", expected.className);
    const member = declaration.members?.find(({ name }) => name === expected.memberName);

    assert.equal(member?.kind, "field", `${expected.className}.${expected.memberName} kind`);
    assert.equal(
      member?.readonly,
      expected.readonly,
      `${expected.className}.${expected.memberName} readonly`,
    );
    assert.equal(
      member?.inheritedFrom?.name,
      expected.inheritedFrom,
      `${expected.className}.${expected.memberName} inheritedFrom`,
    );
  }
});

test("accessor pairs keep metadata declared on either half", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["accessor-members.js"],
  });
  const declaration = getClass(manifest, "accessor-members.js", "AccessorBase");
  const member = declaration.members?.find(({ name }) => name === "documentedPair");

  assert.equal(member?.kind, "field");
  assert.equal(member?.type?.text, "string");
  assert.equal(member?.description, "Documented accessor pair.");
  assert.equal(member?.summary, "Pair summary.");
  assert.equal(member?.attribute, "pair-value");
  assert.equal(member?.default, '"pair"');
  assert.equal(member?.reflects, true);
  assert.equal(member?.readonly, undefined, "a get/set pair is not readonly");
});

test("declare-only class fields are excluded from members", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["declare-members.ts"],
  });
  const declaration = getClass(manifest, "declare-members.ts", "DeclareMembersElement");

  assert.ok(declaration);
  const memberNames = declaration.members?.map((member) => member.name) ?? [];
  assert.equal(memberNames.includes("addEventListener"), false);
  assert.equal(memberNames.includes("emit"), false);
  assert.equal(memberNames.includes("value"), true);
  assert.equal(memberNames.includes("reset"), true);
});

test("reuses class member analysis for the same declaration and checker", () => {
  const result = createProgramFromTsConfig(fixturesTsConfig);
  const sourceFile = result.sourceFiles.find((file) =>
    file.fileName.endsWith("inheritance-fixture.ts"),
  );
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
        { invariants: "error" },
      ),
    (error) =>
      error?.name === "ManifestValidationError" &&
      error.failures.some((failure) => failure.message.includes("missing declaration")),
  );
});
