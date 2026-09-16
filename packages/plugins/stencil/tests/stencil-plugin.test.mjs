import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { stencilPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("detects Stencil components, props, events, and lifecycle methods", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [stencilPlugin()] });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "TodoList");

  assert.equal(declaration?.tagName, "todo-list");
  assert.deepEqual(
    declaration?.attributes
      ?.map(({ name, fieldName }) => ({ name, fieldName }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [
      { name: "color", fieldName: "color" },
      { name: "controller", fieldName: "controller" },
      { name: "is-valid", fieldName: "isValid" },
      { name: "message", fieldName: "message" },
      { name: "valid", fieldName: "valid" },
    ],
  );
  assert.equal(declaration?.members?.find((member) => member.name === "message")?.reflects, true);
  assert.equal(
    declaration?.members?.some((member) => member.name === "componentDidLoad"),
    false,
  );
  assert.equal(
    declaration?.members?.some((member) => member.name === "someMethod"),
    true,
  );
  assert.deepEqual(declaration?.events?.map((event) => event.name).sort(), [
    "foo",
    "panel-change",
    "todoCompleted",
  ]);
  assert.deepEqual(declaration?.slots?.map(({ name }) => name).sort(), ["", "header"]);
  assert.equal(declaration?.slots?.find(({ name }) => name === "header")?.description, "Header");
  assert.deepEqual(
    declaration?.cssParts?.map(({ name }) => name),
    ["panel"],
  );
  assert.equal(declaration?.cssParts?.[0]?.description, "Panel");
  assert.equal(declaration?.cssProperties?.[0]?.name, "--panel-color");
  assert.equal(
    manifest.modules[0].exports?.some(
      (entry) => entry.kind === "custom-element-definition" && entry.name === "todo-list",
    ),
    true,
  );
});
