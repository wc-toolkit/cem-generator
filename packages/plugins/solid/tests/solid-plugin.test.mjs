import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { solidPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("detects Solid Element registrations and props", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [solidPlugin()] });
  const greeting = manifest.modules
    .flatMap((module) => module.declarations)
    .find((declaration) => declaration.name === "Greeting");

  assert.equal(greeting?.tagName, "solid-greeting");
  assert.equal(greeting?.description, "A Solid greeting custom element.");
  assert.deepEqual(greeting?.members?.map(({ name }) => name).sort(), ["count", "name"]);
  assert.deepEqual(
    greeting?.attributes
      ?.map(({ name, fieldName }) => ({ name, fieldName }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [
      { name: "count", fieldName: "count" },
      { name: "name", fieldName: "name" },
    ],
  );
  assert.equal(greeting?.members?.find(({ name }) => name === "count")?.default, "1");
  assert.equal(greeting?.events?.[0]?.name, "greet");
  assert.deepEqual(greeting?.slots?.map(({ name }) => name).sort(), ["", "label"]);
  assert.equal(greeting?.slots?.find(({ name }) => name === "label")?.description, "Label content");
  assert.deepEqual(
    greeting?.cssParts?.map(({ name }) => name),
    ["label"],
  );
  assert.equal(greeting?.cssParts?.[0]?.description, "Greeting label");
  assert.equal(greeting?.cssProperties?.[0]?.name, "--greeting-color");
});
