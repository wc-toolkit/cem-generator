import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

import { createProgramFromTsConfig } from "../dist/program.js";
import { runPipeline } from "../dist/pipeline.js";
import { TARGET_CEM_SCHEMA_VERSION } from "../dist/pipeline.js";

const require = createRequire(import.meta.url);
const cemSchema = require("custom-elements-manifest");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesTsConfig = path.resolve(__dirname, "fixtures/tsconfig.json");

test("supports standard component API JSDoc tags", () => {
  const program = createProgramFromTsConfig(fixturesTsConfig);
  const manifest = runPipeline(program);

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
});

test("emits parsed types for fields, attributes, events, method params, and returns", () => {
  const program = createProgramFromTsConfig(fixturesTsConfig);
  const manifest = runPipeline(program);

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
