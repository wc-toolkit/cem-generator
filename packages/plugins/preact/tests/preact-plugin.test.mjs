import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { preactPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("detects preact-custom-element registrations and component props", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [preactPlugin()] });
  const greeting = manifest.modules
    .flatMap((module) => module.declarations)
    .find((declaration) => declaration.name === "Greeting");
  const greetingModule = manifest.modules.find((module) => module.declarations.includes(greeting));

  assert.equal(greeting?.tagName, "x-greeting");
  assert.equal(greetingModule?.exports?.some((entry) => entry.kind === "js" && entry.name === "Greeting"), true);
  assert.deepEqual(greeting?.members?.map(({ name }) => name).sort(), ["count", "name"]);
  assert.deepEqual(greeting?.attributes?.map(({ name, fieldName }) => ({ name, fieldName })), [
    { name: "name", fieldName: "name" },
  ]);
  assert.equal(greeting?.members?.find(({ name }) => name === "name")?.attribute, "name");
  assert.deepEqual(greeting?.slots?.map(({ name }) => name).sort(), ["", "label"]);
  assert.equal(greeting?.slots?.find(({ name }) => name === "label")?.description, "Label content");
  assert.deepEqual(greeting?.cssParts?.map(({ name }) => name), ["label"]);
  assert.equal(greeting?.cssParts?.[0]?.description, "Greeting label");
  assert.equal(greeting?.cssProperties?.[0]?.name, "--greeting-color");
  assert.equal(greeting?.events?.[0]?.name, "greet");
});
