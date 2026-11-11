import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { litPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("detects Lit components extending a custom base declared in another file", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [litPlugin()] });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "TransitiveLitElement");

  assert.ok(declaration, "Expected TransitiveLitElement declaration");
  assert.equal(declaration.tagName, "transitive-lit-element");
  assert.equal(declaration.superclass?.name, "CustomLitBase");
});

test("ignores subclasses of base classes unrelated to Lit", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [litPlugin()] });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "UnrelatedElement");

  assert.equal(declaration, undefined);
});
