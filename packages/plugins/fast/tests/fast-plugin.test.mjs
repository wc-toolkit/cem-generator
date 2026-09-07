import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { fastPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("detects FAST elements, custom element decorators, and @attr metadata", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [fastPlugin()] });
  const declarations = manifest.modules.flatMap((module) => module.declarations);
  const nameTag = declarations.find((declaration) => declaration.name === "NameTag");
  const booleanTest = declarations.find((declaration) => declaration.name === "BooleanTest");

  assert.equal(nameTag?.tagName, "name-tag");
  assert.deepEqual(
    nameTag?.attributes?.map(({ name, fieldName }) => ({ name, fieldName })),
    [
      { name: "greeting", fieldName: "greeting" },
      { name: "my-attr", fieldName: "bar" },
    ]
  );
  assert.equal(nameTag?.members?.find((member) => member.name === "bar")?.attribute, "my-attr");
  assert.equal(nameTag?.superclass?.name, "FASTElement");

  assert.equal(booleanTest?.tagName, "boolean-test");
  assert.deepEqual([...((booleanTest?.attributes ?? []).map((attribute) => attribute.name))].sort(), [
    "normalAttr",
    "booleanAttr",
    "customName",
  ].sort());
  assert.equal(booleanTest?.members?.some((member) => [
    "connectedCallback",
    "disconnectedCallback",
    "attributeChangedCallback",
    "$emit",
  ].includes(member.name)), false);
  assert.equal(booleanTest?.members?.some((member) => member.name === "activate"), true);
  const activated = booleanTest?.events?.find((event) => event.name === "button-activated");
  assert.equal(activated?.type?.text, "CustomEvent");
  assert.equal(activated?.detail?.text, "{ source: this; }");
  assert.equal(
    manifest.modules.find((module) => module.declarations.some((declaration) => declaration.name === "BooleanTest"))
      ?.exports?.some((entry) => entry.kind === "custom-element-definition" && entry.name === "boolean-test"),
    true
  );
});
