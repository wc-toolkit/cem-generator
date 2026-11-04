import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { sveltePlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("detects Svelte custom elements, props, slots, parts, styles, and events", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [sveltePlugin()] });
  const greeting = manifest.modules
    .flatMap((module) => module.declarations)
    .find((declaration) => declaration.name === "Greeting");

  assert.equal(greeting?.tagName, "solid-greeting");
  assert.deepEqual(greeting?.members?.map(({ name }) => name).sort(), ["count", "name"]);
  assert.deepEqual(greeting?.slots?.map(({ name }) => name).sort(), ["", "label"]);
  assert.equal(greeting?.slots?.find(({ name }) => name === "label")?.description, "Label content");
  assert.equal(greeting?.cssParts?.[0]?.name, "label");
  assert.equal(greeting?.cssParts?.[0]?.description, "Greeting label");
  assert.equal(greeting?.cssProperties?.[0]?.name, "--greeting-color");
  assert.equal(greeting?.events?.[0]?.name, "greet");
});

test("emits custom JSDoc tags on Svelte component and prop declarations", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    plugins: [sveltePlugin()],
    customJsDocTags: true,
  });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "CustomTags");

  assert.ok(declaration, "Expected CustomTags declaration");
  assert.deepEqual(declaration.owner, { name: "design-system" });
  assert.equal(declaration.description, "A component documented with custom tags.");

  const label = declaration.members?.find((member) => member.name === "label");
  assert.deepEqual(label?.owner, { name: "content-team" });
  assert.equal(label?.description, "Label shown in the element.");

  const count = declaration.members?.find((member) => member.name === "count");
  assert.deepEqual(count?.badge, { name: "small" });
  assert.equal(count?.description, "Count shown beside the label.");
});

test("does not emit custom JSDoc tags unless enabled", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [sveltePlugin()] });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "CustomTags");

  assert.ok(declaration, "Expected CustomTags declaration");
  assert.equal(declaration.owner, undefined);
  assert.equal(declaration.members?.find((member) => member.name === "label")?.owner, undefined);
});
