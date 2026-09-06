import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

import { generateCem } from "../dist/pipeline.js";
import { TARGET_CEM_SCHEMA_VERSION } from "../dist/pipeline.js";

const require = createRequire(import.meta.url);
const cemSchema = require("custom-elements-manifest");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("supports standard component API JSDoc tags", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, customJsDocTags: true });

  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(cemSchema);
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors, null, 2));

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "StandardTagsElement");

  assert.ok(decl, "Expected StandardTagsElement declaration");
  assert.equal(manifest.schemaVersion, TARGET_CEM_SCHEMA_VERSION);

  assert.equal(decl.tagName, "standard-tags-element");
  assert.equal(decl.summary, "Compact summary for quick docs.");
  assert.equal(decl.deprecated, "Use BetterElement instead.");

  assert.ok(decl.attributes?.some((a) => a.name === "disabled"));
  assert.ok(decl.events?.some((e) => e.name === "custom-event"));
  assert.ok(decl.events?.some((e) => e.name === "typed-event" && e.type?.text === "Event"));
  assert.ok(decl.slots?.some((s) => s.name === ""));
  assert.ok(decl.slots?.some((s) => s.name === "container"));
  assert.ok(decl.cssProperties?.some((p) => p.name === "--text-color"));
  assert.ok(decl.cssProperties?.some((p) => p.name === "--background-color"));
  assert.ok(decl.cssParts?.some((p) => p.name === "bar"));
  assert.ok(decl.cssStates?.some((s) => s.name === "open"));

  assert.deepEqual(decl.since, { name: "2.0.0" }, "Expected structured @since metadata on the declaration");
  assert.deepEqual(decl.license, { name: "MIT" }, "Expected structured @license metadata on the declaration");
  assert.deepEqual(decl.status, { name: "beta", description: "not ready for production" });
  assert.deepEqual(decl.dependency, [{ name: "icon" }, { name: "button" }]);
  assert.equal(decl.customJsDocTags, undefined, "No customJsDocTags array should be emitted");

  assert.equal(manifest.since, undefined, "Expected @since to remain declaration-scoped");
  assert.equal(manifest.license, undefined, "Expected @license to remain declaration-scoped");
  assert.equal(manifest.group, undefined, "Expected member-scoped @group to remain out of the root");
  assert.equal(decl.group, undefined, "Expected @group only on the member, not the declaration");

  const externalTitle = decl.members?.find((m) => m.name === "externalTitle");
  assert.ok(externalTitle, "Expected @prop member to be included");
  assert.equal(externalTitle.kind, "field");
  assert.equal(externalTitle.type?.text, "string");

  const displayName = decl.members?.find((m) => m.name === "displayName");
  assert.ok(displayName, "Expected displayName member");
  assert.equal(displayName.summary, "Displayed user-facing name");

  const displayNameAttr = decl.attributes?.find((a) => a.name === "display-name");
  assert.ok(displayNameAttr, "Expected @attribute to create display-name attribute");
  assert.equal(displayNameAttr.default, "fallback-name");
  assert.equal(displayNameAttr.fieldName, "displayName");

  assert.equal(
    decl.members?.some((m) => m.name === "hiddenProp"),
    false,
    "Expected @internal member to be omitted"
  );
  assert.equal(
    decl.attributes?.some((a) => a.name === "temp-hidden"),
    false,
    "Expected @internal attribute mapping to be omitted"
  );

  const doWork = decl.members?.find((m) => m.name === "doWork");
  assert.ok(doWork, "Expected doWork method");
  assert.equal(doWork.kind, "method");
  assert.equal(doWork.summary, "Runs action");
  assert.equal(doWork.deprecated, "Use runV2 instead.");
  assert.equal(doWork.parameters?.[0]?.name, "input");
  assert.equal(doWork.parameters?.[1]?.name, "rest");
  assert.equal(doWork.parameters?.[1]?.rest, true);
  assert.ok(doWork.return?.type?.text);

  const groupTag = doWork.group;
  assert.ok(groupTag, "Expected @group custom tag on member as inline property");
  assert.deepEqual(groupTag, { name: "actions" });
  assert.equal(doWork.customJsDocTags, undefined, "No customJsDocTags array should be emitted on members");

  const internalCount = decl.members?.find((m) => m.name === "#internalCount");
  assert.ok(internalCount, "Expected #-prefixed private member to be included");
  assert.equal(internalCount.privacy, "private");

  const increment = decl.members?.find((m) => m.name === "#increment");
  assert.ok(increment, "Expected #-prefixed private method to be included");
  assert.equal(increment.kind, "method");
  assert.equal(increment.privacy, "private");

  const internalFlag = decl.members?.find((m) => m.name === "_internalFlag");
  assert.ok(internalFlag, "Expected _-prefixed member to be included");
  assert.equal(internalFlag.kind, "field");
  assert.equal(internalFlag.privacy, undefined);

  const counter = decl.members?.find((m) => m.name === "counter");
  assert.ok(counter, "Expected counter member");
  assert.equal(counter.default, "3");

  const label = decl.members?.find((m) => m.name === "label");
  assert.ok(label, "Expected label member");
  assert.equal(label.default, "'primary'");
});

test("maps custom tags and preserves configured single values as arrays", () => {
  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
      customJsDocTags: {
      dependency: { mappedName: "dependencies", isArray: true },
    },
  });

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "StandardTagsElement");

  assert.ok(decl, "Expected StandardTagsElement declaration");
  assert.deepEqual(decl.dependencies, [{ name: "icon" }, { name: "button" }]);
  assert.equal(decl.dependency, undefined);
});

test("does not emit custom JSDoc tags unless enabled", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });
  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "StandardTagsElement");

  assert.ok(decl, "Expected StandardTagsElement declaration");
  assert.equal(decl.since, undefined);
  assert.equal(decl.license, undefined);
});

test("auto-discovers slots from slot elements in template literals", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "SlotDiscoveryElement");

  assert.ok(decl, "Expected SlotDiscoveryElement declaration");

  const slots = decl.slots ?? [];

  const header = slots.find((s) => s.name === "header");
  assert.ok(header, "Expected header slot");
  assert.equal(header.description, "JSDoc override description");

  const defaultSlot = slots.find((s) => s.name === "");
  assert.ok(defaultSlot, "Expected default slot");
  assert.equal(defaultSlot.description, "Main content area");

  const footer = slots.find((s) => s.name === "footer");
  assert.ok(footer, "Expected footer slot");
  assert.equal(footer.description, undefined);
});

test("auto-discovers CSS custom properties from :host and @property in templates", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "CssPropDiscoveryElement");

  assert.ok(decl, "Expected CssPropDiscoveryElement declaration");

  const cssProps = decl.cssProperties ?? [];

  const bg = cssProps.find((p) => p.name === "--my-card-bg");
  assert.ok(bg, "Expected --my-card-bg");
  assert.equal(bg.default, "steelblue");
  assert.equal(bg.description, "Host text color token.");

  const padding = cssProps.find((p) => p.name === "--my-card-padding");
  assert.ok(padding, "Expected --my-card-padding");
  assert.equal(padding.default, "16px");
  assert.equal(padding.description, "JSDoc override description");

  const radius = cssProps.find((p) => p.name === "--my-card-radius");
  assert.equal(radius, undefined, "Expected commentless :host declaration to be ignored");

  const moduleBg = cssProps.find((p) => p.name === "--module-bg");
  assert.ok(moduleBg, "Expected module-level :host token");
  assert.equal(moduleBg.default, "coral");
  assert.equal(moduleBg.description, "Module-level background token.");

  const fg = cssProps.find((p) => p.name === "--my-card-fg");
  assert.ok(fg, "Expected --my-card-fg");
  assert.equal(fg.syntax, "<color>");
  assert.equal(fg.default, "white");
  assert.equal(fg.description, "Foreground token contract.");
});

test("auto-discovers slots from module-level template literals", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "CssPropDiscoveryElement");

  assert.ok(decl, "Expected CssPropDiscoveryElement declaration");

  const moduleSlot = decl.slots?.find((s) => s.name === "module-slot");
  assert.ok(moduleSlot, "Expected module-level slot");
  assert.equal(moduleSlot.description, "Module-level slot");
});

test("auto-discovers CSS parts from part attributes in templates", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "CssPropDiscoveryElement");

  assert.ok(decl, "Expected CssPropDiscoveryElement declaration");

  const cssParts = decl.cssParts ?? [];

  const button = cssParts.find((p) => p.name === "button");
  assert.ok(button, "Expected button part");
  assert.equal(button.description, "Primary chrome");

  const card = cssParts.find((p) => p.name === "card");
  assert.ok(card, "Expected card part");
  assert.equal(card.description, "Module-level part");

  const footer = cssParts.find((p) => p.name === "footer");
  assert.ok(footer, "Expected footer part");
  assert.equal(footer.description, "JSDoc override description");
});

test("slot description does not leak from preceding non-slot element comments", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "CssPropDiscoveryElement");

  assert.ok(decl, "Expected CssPropDiscoveryElement declaration");

  const defaultSlot = decl.slots?.find((s) => s.name === "");
  assert.ok(defaultSlot, "Expected default slot");
  assert.equal(defaultSlot.description, "Main content");

  const headerPart = decl.cssParts?.find((p) => p.name === "button");
  assert.ok(headerPart, "Expected button part");
  assert.equal(headerPart.description, "Primary chrome");
});

test("auto-discovers CSS custom states from ElementInternals states.add calls", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "CssStateDiscoveryElement");

  assert.ok(decl, "Expected CssStateDiscoveryElement declaration");

  const cssStates = decl.cssStates ?? [];

  const initialized = cssStates.find((s) => s.name === "initialized");
  assert.ok(initialized, "Expected initialized state from #state.states.add");

  const loading = cssStates.find((s) => s.name === "loading");
  assert.ok(loading, "Expected loading state from attachInternals().states.add");

  const busy = cssStates.find((s) => s.name === "busy");
  assert.ok(busy, "Expected busy state");
  assert.equal(busy.description, "JSDoc override description");
});

test("emits parsed types for fields, attributes, events, method params, and returns", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });

  const decl = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "ParsedTypesElement");

  assert.ok(decl, "Expected ParsedTypesElement declaration");

  const modeMember = decl.members?.find((m) => m.name === "mode");
  assert.ok(modeMember, "Expected mode member");
  assert.equal(modeMember.type?.text, "Mode");
  assert.equal(modeMember.parsedType?.text, "'primary' | 'secondary' | undefined");

  const modeAttr = decl.attributes?.find((a) => a.name === "mode");
  assert.ok(modeAttr, "Expected mode attribute");
  assert.equal(modeAttr.type?.text, "Mode");
  assert.equal(modeAttr.parsedType?.text, "'primary' | 'secondary' | undefined");

  const sharedModeAttr = decl.attributes?.find((a) => a.name === "shared-mode");
  assert.ok(sharedModeAttr, "Expected shared-mode attribute");
  assert.equal(sharedModeAttr.type?.text, "SharedMode");
  assert.equal(sharedModeAttr.parsedType?.text, "'inline' | 'block' | undefined");

  const event = decl.events?.find((e) => e.name === "payload-change");
  assert.ok(event, "Expected payload-change event");
  assert.equal(event.type?.text, "Payload");
  assert.ok(event.parsedType?.text?.includes("id: string"));

  const method = decl.members?.find((m) => m.name === "setPayload");
  assert.ok(method, "Expected setPayload method");
  assert.equal(method.return?.type?.text, "Payload");
  assert.ok(method.return?.parsedType?.text?.includes("count: number"));

  const modeParam = method.parameters?.find((p) => p.name === "mode");
  assert.ok(modeParam, "Expected mode parameter");
  assert.equal(modeParam.type?.text, "Mode");
  assert.equal(modeParam.parsedType?.text, "'primary' | 'secondary' | undefined");

  const sharedMethod = decl.members?.find((m) => m.name === "setShared");
  assert.ok(sharedMethod, "Expected setShared method");
  const sharedModeParam = sharedMethod.parameters?.find((p) => p.name === "mode");
  assert.ok(sharedModeParam, "Expected shared mode parameter");
  assert.equal(sharedModeParam.type?.text, "SharedMode");
  assert.equal(sharedModeParam.parsedType?.text, "'inline' | 'block' | undefined");

  const sharedPayloadParam = sharedMethod.parameters?.find((p) => p.name === "payload");
  assert.ok(sharedPayloadParam, "Expected shared payload parameter");
  assert.equal(sharedPayloadParam.type?.text, "SharedPayload");
  assert.ok(sharedPayloadParam.parsedType?.text?.includes("active: boolean"));

  assert.equal(sharedMethod.return?.type?.text, "SharedPayload");
  assert.ok(sharedMethod.return?.parsedType?.text?.includes("id: string"));
});

test("materializes inheritance and omits inherited APIs via JSDoc tags", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig });

  const child = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "ChildElement");

  assert.ok(child, "Expected ChildElement declaration");

  const memberNames = (child.members ?? []).map((m) => m.name);
  assert.ok(memberNames.includes("childMethod"));
  assert.ok(memberNames.includes("keepMethod"));
  assert.equal(memberNames.includes("baseMethod"), false);

  const attributeNames = (child.attributes ?? []).map((a) => a.name);
  assert.ok(attributeNames.includes("keep-attr"));
  assert.equal(attributeNames.includes("base-count"), false);

  const eventNames = (child.events ?? []).map((e) => e.name);
  assert.ok(eventNames.includes("keep-event"));
  assert.equal(eventNames.includes("base-event"), false);
});

test("can disable built-in inheritance materialization", () => {
  const manifest = generateCem({ tsConfigPath: fixturesTsConfig, inheritance: false });

  const child = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "ChildElement");

  assert.ok(child, "Expected ChildElement declaration");
  const memberNames = (child.members ?? []).map((m) => m.name);
  assert.ok(memberNames.includes("childMethod"));
  assert.equal(memberNames.includes("keepMethod"), false);
});

test("resolves inheritance from external manifests", () => {
  const externalManifest = {
    schemaVersion: "2.1.0",
    modules: [
      {
        kind: "javascript-module",
        path: "external/base.js",
        declarations: [
          {
            kind: "class",
            name: "ExternalBase",
            customElement: true,
            members: [{ kind: "method", name: "externalMethod" }],
            attributes: [{ name: "external-attr" }],
            events: [{ name: "external-event", type: { text: "Event" } }],
          },
        ],
      },
    ],
  };

  const manifest = generateCem({
    tsConfigPath: fixturesTsConfig,
    inheritance: {
      externalManifests: [externalManifest],
    },
  });

  const child = manifest.modules
    .flatMap((m) => m.declarations)
    .find((d) => d.name === "ExternalChildElement");

  assert.ok(child, "Expected ExternalChildElement declaration");

  const memberNames = (child.members ?? []).map((m) => m.name);
  assert.ok(memberNames.includes("ownMethod"));
  assert.ok(memberNames.includes("externalMethod"));

  const attributeNames = (child.attributes ?? []).map((a) => a.name);
  assert.ok(attributeNames.includes("external-attr"));

  const eventNames = (child.events ?? []).map((e) => e.name);
  assert.ok(eventNames.includes("external-event"));
});

test("can include external manifest declarations in output", () => {
  const externalManifest = {
    schemaVersion: "2.1.0",
    modules: [
      {
        kind: "javascript-module",
        path: "external/base.js",
        declarations: [
          {
            kind: "class",
            name: "ExternalBase",
            customElement: true,
            tagName: "external-base",
            members: [{ kind: "method", name: "externalMethod" }],
          },
        ],
      },
    ],
  };

  const manifest = generateCem({
    inheritance: {
      externalManifests: [externalManifest],
      includeExternalManifests: true,
    },
  });

  const externalModule = manifest.modules.find((m) => m.path === "external/base.js");
  assert.ok(externalModule, "Expected external module to be present");

  const externalBase = externalModule.declarations.find((d) => d.name === "ExternalBase");
  assert.ok(externalBase, "Expected ExternalBase declaration");
  assert.equal(externalBase.tagName, "external-base");
});
