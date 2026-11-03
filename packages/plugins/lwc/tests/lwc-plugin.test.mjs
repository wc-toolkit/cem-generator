import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { lwcPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

function generate(options) {
  return generateCem({ tsConfigPath: fixturesTsConfig, plugins: [lwcPlugin(options)] });
}

function findDeclaration(manifest, name) {
  return manifest.modules
    .flatMap((module) => module.declarations)
    .find((declaration) => declaration.name === name);
}

test("derives tag names from bundle folders with the default namespace", () => {
  const manifest = generate();
  const greetingCard = findDeclaration(manifest, "GreetingCard");
  const warningCard = findDeclaration(manifest, "WarningCard");

  assert.equal(greetingCard?.tagName, "c-greeting-card");
  assert.equal(greetingCard?.customElement, true);
  assert.equal(warningCard?.tagName, "c-warning-card");
});

test("applies a custom namespace to bundle tag names", () => {
  const manifest = generate({ namespace: "acme" });

  assert.equal(findDeclaration(manifest, "GreetingCard")?.tagName, "acme-greeting-card");
});

test("exposes only @api members and omits tracked, private, and internal fields", () => {
  const greetingCard = findDeclaration(generate(), "GreetingCard");
  const memberNames = greetingCard?.members?.map((member) => member.name).sort();

  assert.deepEqual(memberNames, ["highlighted", "message", "recipientName", "reset"]);
  assert.equal(greetingCard?.members?.find((member) => member.name === "reset")?.kind, "method");
});

test("maps @api properties to kebab-case attributes", () => {
  const greetingCard = findDeclaration(generate(), "GreetingCard");

  assert.deepEqual(
    greetingCard?.attributes?.map(({ name, fieldName }) => ({ name, fieldName })),
    [
      { name: "highlighted", fieldName: "highlighted" },
      { name: "message", fieldName: "message" },
      { name: "recipient-name", fieldName: "recipientName" },
    ],
  );
  assert.equal(
    greetingCard?.members?.find((member) => member.name === "recipientName")?.attribute,
    "recipient-name",
  );
  assert.equal(
    greetingCard?.attributes?.find((attribute) => attribute.name === "recipient-name")?.default,
    '"World"',
  );
});

test("documents CustomEvent dispatches and default and named slots", () => {
  const greetingCard = findDeclaration(generate(), "GreetingCard");
  const select = greetingCard?.events?.find((event) => event.name === "select");

  assert.equal(select?.type?.text, "CustomEvent");
  assert.equal(select?.detail?.text, "{ id: string; }");
  assert.deepEqual(
    greetingCard?.slots?.map(({ name, description }) => ({ name, description })),
    [
      { name: "", description: "Main content of the card" },
      { name: "footer", description: "Footer content" },
    ],
  );
});

test("records the LightningElement base and resolves local component inheritance", () => {
  const manifest = generate();
  const greetingCard = findDeclaration(manifest, "GreetingCard");
  const baseCard = findDeclaration(manifest, "BaseCard");
  const warningCard = findDeclaration(manifest, "WarningCard");

  assert.deepEqual(greetingCard?.superclass, { name: "LightningElement", module: "lwc" });
  assert.equal(baseCard?.tagName, undefined);
  assert.equal(baseCard?.customElement, false);
  assert.equal(warningCard?.superclass?.name, "BaseCard");
  assert.equal(
    warningCard?.attributes?.find((attribute) => attribute.name === "title")?.inheritedFrom?.name,
    "BaseCard",
  );
});

test("ignores non-component modules", () => {
  const manifest = generate();
  assert.equal(findDeclaration(manifest, "format"), undefined);
});
