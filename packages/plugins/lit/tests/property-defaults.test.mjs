import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { litPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("preserves decorated Lit property initializer defaults on fields and attributes", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [litPlugin()] });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "LitPropertyDefaultsElement");

  assert.ok(declaration, "Expected LitPropertyDefaultsElement declaration");

  const expectedDefaults = new Map([
    ["count", "2"],
    ["label", '"Basic label"'],
    ["enabled", "false"],
    ["values", '["a"]'],
    ["createdAt", "new Date(0)"],
    ["documented", '"documented"'],
  ]);

  for (const [name, expected] of expectedDefaults) {
    const member = declaration.members?.find((item) => item.name === name);
    assert.equal(member?.default, expected, `${name} member default`);

    const attributeName = name === "label" ? "basic-label" : name;
    const attribute = declaration.attributes?.find((item) => item.name === attributeName);
    assert.equal(attribute?.default, expected, `${attributeName} attribute default`);
  }
});
