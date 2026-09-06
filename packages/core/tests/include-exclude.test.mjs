import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../dist/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

function declarationNames(manifest) {
  return manifest.modules.flatMap((m) => m.declarations.map((d) => d.name));
}

function moduleBasenames(manifest) {
  return manifest.modules.map((m) => path.basename(m.path));
}

test("omitted include/exclude analyzes all fixture files", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });
  const names = declarationNames(manifest);

  assert.ok(names.includes("StandardTagsElement"));
  assert.ok(names.includes("ParsedTypesElement"));
});

test("include narrows analysis to matching files", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["**/standard-tags-element.js"],
  });

  assert.deepEqual(moduleBasenames(manifest), ["standard-tags-element.js"]);
  assert.deepEqual(declarationNames(manifest), ["StandardTagsElement"]);
});

test("exclude removes matching files from analysis", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    exclude: ["**/standard-tags-element.js"],
  });
  const names = declarationNames(manifest);

  assert.ok(!names.includes("StandardTagsElement"));
  assert.ok(names.includes("ParsedTypesElement"));
});

test("exclude wins over include", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    include: ["**/*.ts", "**/*.js"],
    exclude: ["**/parsed-types-element.ts"],
  });
  const names = declarationNames(manifest);

  assert.ok(!names.includes("ParsedTypesElement"));
  assert.ok(names.includes("StandardTagsElement"));
});

test("empty include behaves like omitted include", () => {
  const baseline = generateCem({ tsConfigPath: fixturesTsConfig });
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, include: [] });

  assert.equal(manifest.modules.length, baseline.modules.length);
});
