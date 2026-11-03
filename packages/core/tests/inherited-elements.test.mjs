import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");
const noDomTsConfig = path.resolve(__dirname, "no-dom-fixture/tsconfig.json");

const declarationsOf = (include = "abstract-base-element.ts", tsConfigPath = fixturesTsConfig) =>
  generateCem({ tsConfigPath, include: [include] })
    .modules.flatMap((module) => module.declarations ?? [])
    .filter((declaration) => declaration.customElement);

test("a subclass of a custom base class of HTMLElement is an element", () => {
  const names = declarationsOf().map(({ name }) => name);

  assert.ok(names.includes("CardElement"));
  assert.ok(names.includes("UnregisteredCard"));
  assert.ok(!names.includes("CardModel"));
});

test("a subclass of a base given type arguments is an element", () => {
  const names = declarationsOf("generic-base-element.ts").map(({ name }) => name);

  assert.deepEqual(names.sort(), ["ShortText", "TextValue", "ValueBase"]);
});

test("a subclass of a mixin of an element's base is an element", () => {
  const names = declarationsOf("mixin-base-element.ts").map(({ name }) => name);

  assert.deepEqual(names.sort(), ["CardBase", "ThemedCard"]);
});

test("a tag registered by its constant is the element's tag", () => {
  const card = declarationsOf().find(({ name }) => name === "CardElement");

  assert.equal(card?.tagName, "my-card");
  assert.equal(card?.superclass?.name, "CardBase");
  assert.deepEqual(
    card?.events?.map(({ name }) => name),
    ["card-open"],
  );
});

test("a tag the checker cannot know is no tag", () => {
  const elements = declarationsOf("dynamic-tag-element.ts");

  assert.deepEqual(elements.map(({ name }) => name).sort(), [
    "ComputedTagElement",
    "LetTagElement",
    "TemplateTagElement",
  ]);
  assert.ok(elements.every(({ tagName }) => tagName === undefined));
});

test("a class of the user's own named HTMLElement is not the DOM's", () => {
  assert.deepEqual(declarationsOf("shadowed-html-element.ts"), []);
});

test("without the DOM lib, a class that extends HTMLElement is an element by its name", () => {
  const names = declarationsOf("plain-element.ts", noDomTsConfig).map(({ name }) => name);

  assert.deepEqual(names, ["PlainElement"]);
});

test("without the DOM lib, a class of the user's own named HTMLElement is not the DOM's", () => {
  assert.deepEqual(declarationsOf("shadowed-html-element.ts", noDomTsConfig), []);
});
