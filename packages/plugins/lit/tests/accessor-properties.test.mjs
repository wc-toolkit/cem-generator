import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { litPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("captures Lit property metadata from getter and setter accessors", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [litPlugin()] });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "LitAccessorPropertiesElement");

  assert.ok(declaration, "Expected LitAccessorPropertiesElement declaration");

  const label = declaration.members?.find((member) => member.name === "label");
  assert.equal(label?.type?.text, "string");
  assert.equal(label?.attribute, "label-text");
  assert.equal(label?.reflects, true);
  assert.equal(label?.description, "Accessible label.");

  const labelAttribute = declaration.attributes?.find(
    (attribute) => attribute.name === "label-text",
  );
  assert.equal(labelAttribute?.fieldName, "label");
  assert.equal(labelAttribute?.type?.text, "string");

  const count = declaration.members?.find((member) => member.name === "count");
  assert.equal(count?.type?.text, "number");
  assert.equal(count?.attribute, "item-count");
  assert.equal(count?.description, "Number of items.");

  assert.equal(
    declaration.attributes?.some((attribute) => attribute.name === "internal-token"),
    false,
    "attribute: false accessors should not produce attributes",
  );
});
