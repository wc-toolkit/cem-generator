import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateCem } from "../../../core/dist/pipeline.js";
import { litPlugin } from "../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("captures only declared CSS custom properties and @property metadata", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [litPlugin()] });

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "LitCssPropsEl");

  assert.ok(decl, "Expected LitCssPropsEl declaration");

  const cssProps = decl.cssProperties ?? [];

  const surface = cssProps.find((p) => p.name === "--surface-color");
  assert.ok(surface, "Expected @property token");
  assert.equal(surface.syntax, "<color>");
  assert.equal(surface.default, "teal");
  assert.equal(surface.description, "Surface color contract for host themes.");

  const hostSpacing = cssProps.find((p) => p.name === "--host-spacing");
  assert.ok(hostSpacing, "Expected :host declaration token");
  assert.equal(hostSpacing.default, "2px");
  assert.equal(hostSpacing.description, "Host spacing token for outer layout.");

  const jsdocOnly = cssProps.find((p) => p.name === "--jsdoc-only");
  assert.ok(jsdocOnly, "Expected @cssprop JSDoc token");
  assert.equal(jsdocOnly.description, "Documented by JSDoc only");

  assert.equal(cssProps.some((p) => p.name === "--usage-only"), false);

  const parts = decl.cssParts ?? [];
  const buttonPart = parts.find((p) => p.name === "button");
  const iconPart = parts.find((p) => p.name === "icon");
  assert.ok(buttonPart, "Expected part from markup to be documented");
  assert.equal(buttonPart.description, "Primary button chrome");
  assert.ok(iconPart, "Expected JSDoc part to merge with markup part");
  assert.equal(iconPart.description, "Icon glyph wrapper part");
});
