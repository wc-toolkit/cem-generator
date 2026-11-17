import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { API } from "typescript/sync";
import * as is from "typescript/ast/is";
import { detectClassMembers, generateCem } from "../dist/index.js";

const UNRELATED_CLASSES = 20;
const MEMBERS_PER_CLASS = 5;

function writeProject(root, { mentionInComments }) {
  const srcDir = path.join(root, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ES2022",
        moduleResolution: "bundler",
        lib: ["ES2022", "DOM"],
        strict: true,
      },
      include: ["src"],
    }),
  );

  for (let i = 0; i < UNRELATED_CLASSES; i++) {
    const doc = mentionInComments
      ? "/** A plain model. The word HTMLElement appears only in this comment. */"
      : "/** A plain model. */";
    fs.writeFileSync(
      path.join(srcDir, `model-${i}.ts`),
      `${doc}
export class Model${i} {
${Array.from(
  { length: MEMBERS_PER_CLASS },
  (_, member) => `  /** Field ${member}. */\n  field${member} = ${i};`,
).join("\n")}
}
`,
    );
  }

  fs.writeFileSync(
    path.join(srcDir, "card.ts"),
    `export class MyCard extends HTMLElement {
  /** The label. */
  label: string = "card";

  /** The count. */
  count = 0;
}

customElements.define("my-card", MyCard);
`,
  );

  return path.join(root, "tsconfig.json");
}

function createProject(options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cem-prefetch-"));
  return { root, tsConfigPath: writeProject(root, options) };
}

/** Counts the checker requests sent in batched prefetches, without changing their results. */
function countBatchedRequests() {
  const original = API.prototype.batch;
  const stats = { calls: 0, requests: 0 };
  API.prototype.batch = function (...requests) {
    stats.calls += 1;
    stats.requests += requests.length;
    return original.apply(this, requests);
  };
  return {
    stats,
    restore() {
      API.prototype.batch = original;
    },
  };
}

test("prefetch skips unrelated classes that only mention HTMLElement in a comment", () => {
  const withComment = createProject({ mentionInComments: true });
  const withoutComment = createProject({ mentionInComments: false });

  try {
    const counter = countBatchedRequests();
    let manifest;
    try {
      manifest = generateCem({ tsConfigPath: withComment.tsConfigPath });
    } finally {
      counter.restore();
    }

    const expected = generateCem({ tsConfigPath: withoutComment.tsConfigPath });
    assert.deepEqual(manifest, expected);
    assert.deepEqual(
      manifest.modules.flatMap((module) =>
        module.declarations.map((declaration) => declaration.name),
      ),
      ["MyCard"],
    );

    // Only MyCard's two fields are prefetched; the unrelated classes would add 100 queries.
    assert.equal(counter.stats.calls, 1);
    assert.ok(counter.stats.requests > 0);
    assert.ok(
      counter.stats.requests < UNRELATED_CLASSES * MEMBERS_PER_CLASS,
      `expected fewer than ${UNRELATED_CLASSES * MEMBERS_PER_CLASS} prefetch requests, got ${counter.stats.requests}`,
    );
  } finally {
    fs.rmSync(withComment.root, { recursive: true, force: true });
    fs.rmSync(withoutComment.root, { recursive: true, force: true });
  }
});

test("prefetch still covers every class in files claimed by a framework or custom plugin", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cem-prefetch-plugin-"));
  const srcDir = path.join(root, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ES2022",
        moduleResolution: "bundler",
        lib: ["ES2022", "DOM"],
        strict: true,
      },
      include: ["src"],
    }),
  );
  fs.writeFileSync(
    path.join(srcDir, "models.ts"),
    Array.from(
      { length: UNRELATED_CLASSES },
      (_, i) => `export class Model${i} {
${Array.from(
  { length: MEMBERS_PER_CLASS },
  (_, member) => `  /** Field ${member}. */\n  field${member} = ${i};`,
).join("\n")}
}`,
    ).join("\n\n"),
  );

  const modelPlugin = {
    name: "model-detector",
    shouldAnalyze: () => true,
    onFile(context) {
      const fragment = {};
      context.sourceFile.forEachChild(function visit(node) {
        if (is.isClassDeclaration(node) && node.name) {
          fragment[node.name.text] = {
            name: node.name.text,
            members: detectClassMembers(node, context),
          };
        }
        node.forEachChild(visit);
      });
      return fragment;
    },
  };

  try {
    const counter = countBatchedRequests();
    let manifest;
    try {
      manifest = generateCem({
        tsConfigPath: path.join(root, "tsconfig.json"),
        plugins: [modelPlugin],
      });
    } finally {
      counter.restore();
    }

    assert.equal(manifest.modules.length, 1);
    const declaration = manifest.modules[0].declarations[0];
    assert.equal(declaration.members?.length, MEMBERS_PER_CLASS);
    assert.ok(
      counter.stats.requests >= UNRELATED_CLASSES * MEMBERS_PER_CLASS,
      `expected every class in a plugin-claimed file to be prefetched, got ${counter.stats.requests}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
