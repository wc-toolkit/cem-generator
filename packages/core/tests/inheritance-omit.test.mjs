import test from "node:test";
import assert from "node:assert/strict";

import { resolveInheritedCollection } from "@wc-toolkit/cem-generator-utils";

test("resolveInheritedCollection omits inherited names from class metadata + config", () => {
  const base = {
    name: "BaseEl",
    module: "/tmp/base.ts",
    members: [{ name: "baseMethod" }, { name: "keepMethod" }],
    attributes: [{ name: "base-attr" }, { name: "keep-attr" }],
    events: [{ name: "base-event" }, { name: "keep-event" }],
  };

  const child = {
    name: "ChildEl",
    module: "/tmp/child.ts",
    superclass: { name: "BaseEl", module: "/tmp/base.ts" },
    members: [{ name: "childMethod" }],
    attributes: [{ name: "child-attr" }],
    events: [{ name: "child-event" }],
    omitInherited: {
      members: ["baseMethod"],
      attributes: ["base-attr"],
    },
  };

  const findByRef = (ref) => {
    if (ref.name === "BaseEl") return base;
    if (ref.name === "ChildEl") return child;
    return undefined;
  };

  const members = resolveInheritedCollection(findByRef, child, "members", undefined, undefined, {
    omit: {
      byKind: { members: ["keepMethod"] },
      byClassName: { ChildEl: { events: ["base-event"] } },
    },
  });
  assert.deepEqual(
    members.map((m) => m.name),
    ["childMethod"],
  );

  const attributes = resolveInheritedCollection(
    findByRef,
    child,
    "attributes",
    undefined,
    undefined,
    {
      omit: {
        byKind: { attributes: ["keep-attr"] },
      },
    },
  );
  assert.deepEqual(
    attributes.map((m) => m.name),
    ["child-attr"],
  );

  const events = resolveInheritedCollection(findByRef, child, "events", undefined, undefined, {
    omit: {
      byClassName: { ChildEl: { events: ["base-event"] } },
    },
  });
  assert.deepEqual(
    events.map((m) => m.name),
    ["keep-event", "child-event"],
  );
});

test("parseCemClassTags exposes omitInherited from JSDoc tags", async () => {
  const { parseCemClassTags } = await import("@wc-toolkit/cem-generator-utils");
  const { default: ts } = await import("typescript");

  const source = ts.createSourceFile(
    "fixture.ts",
    `/**
      * @omit oldProp
      * @omit-method oldMethod
      * @omit-attr old-attr
      * @omit-event old-event
      * @omit-cssprop --old-token
      * @omit-part old-part
      * @omit-cssstate old-state
      * @omit-slot old-slot
      */
      export class Demo extends HTMLElement {}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const cls = source.statements.find((s) => ts.isClassDeclaration(s));
  assert.ok(cls);
  const parsed = parseCemClassTags(cls);

  assert.deepEqual(parsed.omitInherited?.members, ["oldProp", "oldMethod"]);
  assert.deepEqual(parsed.omitInherited?.attributes, ["oldProp", "old-attr"]);
  assert.deepEqual(parsed.omitInherited?.events, ["old-event"]);
  assert.deepEqual(parsed.omitInherited?.cssProperties, ["--old-token"]);
  assert.deepEqual(parsed.omitInherited?.cssParts, ["old-part"]);
  assert.deepEqual(parsed.omitInherited?.cssStates, ["old-state"]);
  assert.deepEqual(parsed.omitInherited?.slots, ["old-slot"]);
});

test("resolveInheritedCollection allows same class name across different modules", () => {
  const base = {
    name: "Example",
    module: "/tmp/base.js",
    members: [{ name: "baseMethod" }],
  };

  const child = {
    name: "Example",
    module: "/tmp/child.js",
    superclass: { name: "Example", module: "/tmp/base.js" },
    members: [{ name: "childMethod" }],
  };

  const byRef = new Map([
    ["/tmp/base.js#Example", base],
    ["/tmp/child.js#Example", child],
    ["#Example", child],
  ]);

  const findByRef = (ref) => byRef.get(`${ref.module ?? ""}#${ref.name}`);

  const members = resolveInheritedCollection(findByRef, child, "members");

  assert.deepEqual(members, [
    {
      name: "baseMethod",
      inheritedFrom: { name: "Example", module: "/tmp/base.js" },
    },
    { name: "childMethod" },
  ]);
});

test("resolveInheritedCollection still throws on true circular references", () => {
  const a = {
    name: "Example",
    module: "/tmp/a.js",
    superclass: { name: "Example", module: "/tmp/b.js" },
    members: [{ name: "aMethod" }],
  };

  const b = {
    name: "Example",
    module: "/tmp/b.js",
    superclass: { name: "Example", module: "/tmp/a.js" },
    members: [{ name: "bMethod" }],
  };

  const byRef = new Map([
    ["/tmp/a.js#Example", a],
    ["/tmp/b.js#Example", b],
  ]);

  const findByRef = (ref) => byRef.get(`${ref.module ?? ""}#${ref.name}`);

  assert.throws(
    () => resolveInheritedCollection(findByRef, a, "members"),
    /Circular superclass reference detected/,
  );
});
