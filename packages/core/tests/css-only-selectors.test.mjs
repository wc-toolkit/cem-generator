import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../dist/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

function generate() {
  return generateCem({ tsConfigPath: fixturesTsConfig, include: ["css-only-selectors.css"] });
}

function declaration(manifest, tagName) {
  const moduleDoc = manifest.modules.find((module) =>
    module.path.endsWith("css-only-selectors.css"),
  );
  return moduleDoc?.declarations.find((item) => item.tagName === tagName);
}

test("CSS-only detection supports :where(), :is(), and @scope selectors", () => {
  const manifest = generate();

  assert.ok(declaration(manifest, "my-badge"), "plain selector");
  assert.equal(
    declaration(manifest, "my-chip")?.description,
    "Shared reset for tag-like components.",
  );
  assert.equal(
    declaration(manifest, "my-tag")?.description,
    "Shared reset for tag-like components.",
  );
  assert.ok(declaration(manifest, "my-card"), "@scope root");
});

test("CSS-only detection discovers slots from selectors and @slot tags", () => {
  const manifest = generate();
  const badge = declaration(manifest, "my-badge");
  const card = declaration(manifest, "my-card");

  assert.deepEqual(
    badge?.slots?.map((slot) => [slot.name, slot.description]),
    [
      ["icon-end", "The trailing icon."],
      ["icon-start", "The leading icon."],
      ["status", undefined],
    ],
  );
  assert.deepEqual(
    card?.slots?.map(({ name, description }) => ({ name, description })),
    [
      { name: "body", description: "The card body." },
      { name: "footer", description: "The card footer." },
      { name: "header", description: "The card heading." },
      { name: "media", description: "The media area." },
    ],
  );
});

test("CSS-only detection reads attributes from :is()/:where() wrappers", () => {
  const manifest = generate();
  const badge = declaration(manifest, "my-badge");

  assert.deepEqual(
    badge?.attributes?.map(({ name, type }) => ({ name, type })),
    [
      { name: "compact", type: undefined },
      { name: "variant", type: { text: '"danger"' } },
    ],
  );
});
