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

  const publicField = (decl.members ?? []).find((member) => member.name === "publicField");
  assert.equal(publicField?.kind, "field");
  assert.equal(publicField?.type?.text, "string");

  const describeSurface = (decl.members ?? []).find((member) => member.name === "describeSurface");
  assert.equal(describeSurface?.kind, "method");
  assert.equal(describeSurface?.parameters?.[0]?.type?.text, "string");
  assert.equal(describeSurface?.return?.type?.text, "string");

  const surfaceChanged = (decl.events ?? []).find((event) => event.name === "surface-changed");
  assert.equal(surfaceChanged?.type?.text, "CustomEvent");
  assert.equal(surfaceChanged?.detail?.text, "string");

  assert.equal(decl.tagName, "lit-css-props");

  const surfaceColor = (decl.members ?? []).find((member) => member.name === "surfaceColor");
  assert.equal(surfaceColor?.attribute, "surface-color");
  assert.equal(surfaceColor?.reflects, true);

  const internalValue = (decl.members ?? []).find((member) => member.name === "internalValue");
  assert.equal(internalValue?.internal, true);

  const internalPropertyValue = (decl.members ?? []).find((member) => member.name === "internalPropertyValue");
  assert.equal(internalPropertyValue?.internal, true);
  assert.equal(internalPropertyValue?.attribute, undefined);

  const button = (decl.members ?? []).find((member) => member.name === "button");
  assert.equal(button?.internal, true);
  assert.equal(button?.attribute, undefined);

  const legacyFlag = (decl.members ?? []).find((member) => member.name === "legacyFlag");
  assert.equal(legacyFlag?.attribute, "legacy-flag");
  assert.equal(legacyFlag?.reflects, true);
  assert.equal(legacyFlag?.type?.text, "boolean");

  assert.equal(decl.mixins?.[0]?.name, "InputMixin");
  assert.equal(typeof decl.mixins?.[0]?.module, "string");
  const disabled = (decl.members ?? []).find((member) => member.name === "disabled");
  assert.equal(disabled?.attribute, "disabled");
  assert.deepEqual(disabled?.inheritedFrom, decl.mixins?.[0]);
  const mixin = (manifest.modules ?? []).flatMap((module) => module.declarations).find((item) => item.name === "InputMixin");
  assert.equal(mixin?.kind, "mixin");
  assert.ok(mixin?.members?.some((member) => member.name === "disabled"));
  assert.equal(
    manifest.modules.find((module) => module.declarations.some((item) => item.name === "LitCssPropsEl"))?.exports
      ?.some((entry) => entry.kind === "js" && entry.name === "InputMixin"),
    true
  );

  const chainedValue = (decl.members ?? []).find((member) => member.name === "chainedValue");
  assert.equal(chainedValue?.attribute, "chained-value");

  const importedElement = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "ImportedLitElement");
  assert.equal(importedElement?.tagName, "imported-lit-element");
  assert.equal(importedElement?.members?.find((member) => member.name === "externalValue")?.attribute, "external-value");

  const registeredElement = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "RegisteredLitElement");
  assert.equal(registeredElement?.tagName, "registered-lit-element");

  const getterElement = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "GetterPropertiesElement");
  const getterFlag = getterElement?.members?.find((member) => member.name === "getterFlag");
  assert.equal(getterFlag?.attribute, "getterFlag");
  assert.equal(getterFlag?.reflects, true);
  const getterInternal = getterElement?.members?.find((member) => member.name === "getterInternal");
  assert.equal(getterInternal?.attribute, undefined);
  assert.equal(getterFlag?.default, "false");

  const collapsed = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "CollapsedElement");
  assert.equal(collapsed?.tagName, "collapsed-element");
  assert.ok(collapsed?.members?.some((member) => member.name === "lastName" && member.default === '"Doe"'));
  assert.ok(collapsed?.members?.some((member) => member.name === "firstName" && member.default === '"John"'));
  assert.ok(collapsed?.members?.some((member) => member.name === "mixA" && member.inheritedFrom?.name === "MixinA"));
  assert.ok(collapsed?.members?.some((member) => member.name === "mixB" && member.inheritedFrom?.name === "MixinB"));

  const crossModule = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "CrossModuleLitElement");
  assert.equal(crossModule?.tagName, "cross-module-lit");

  assert.equal((decl.members ?? []).some((member) => member.name === "render"), false);
  assert.equal((decl.members ?? []).some((member) => member.name === "properties"), false);
  assert.equal((decl.members ?? []).some((member) => member.name === "styles"), false);
  for (const internalName of [
    "controllers",
    "addController",
    "removeController",
    "hostConnected",
    "hostDisconnected",
  ]) {
    assert.equal((decl.members ?? []).some((member) => member.name === internalName), false, internalName);
  }

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

  const defaultSlot = (decl.slots ?? []).find((slot) => slot.name === "");
  assert.ok(defaultSlot, "Expected slot from Lit template to be documented");
  assert.equal(defaultSlot.description, "Button label");
});

test("preserves custom Lit base classes and marks inherited members", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [litPlugin()] });
  const derived = manifest.modules
    .flatMap((module) => module.declarations)
    .find((declaration) => declaration.name === "DerivedCustomElement");

  assert.equal(derived?.superclass?.name, "BaseCustomElement");
  assert.equal(
    derived?.members?.find((member) => member.name === "baseMethod")?.inheritedFrom?.name,
    "BaseCustomElement",
  );
});

test("captures CSS custom properties from imported Lit styles", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, plugins: [litPlugin()] });
  const declaration = manifest.modules
    .flatMap((module) => module.declarations)
    .find((item) => item.name === "ImportedStylesElement");

  assert.ok(
    declaration?.cssProperties?.some((property) => property.name === "--imported-host-spacing"),
    "Expected CSS property from imported styles",
  );
});
