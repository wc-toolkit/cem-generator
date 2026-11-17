import fs from "node:fs";
import path from "node:path";

/**
 * Fixed benchmark projects, written once and reused across runs so that timing never includes
 * fixture creation. TypeScript 7 and TypeScript 6 builds both read the same sources.
 */
const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "ES2022",
    moduleResolution: "bundler",
    lib: ["ES2022", "DOM"],
    strict: true,
  },
  include: ["src"],
};

function write(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeTsConfig(root) {
  write(root, "tsconfig.json", JSON.stringify(TSCONFIG, null, 2));
}

/** Elements that extend a shared base, with members, events, and registrations. */
function simpleComponents(root, count) {
  writeTsConfig(root);
  write(
    root,
    "src/base.ts",
    `/** Shared base for bench elements. */
export class BenchBase extends HTMLElement {
  /** Shared disabled flag. */
  disabled = false;
  /** Shared size. */
  size: "small" | "large" = "small";
  /**
   * Fired when the base changes.
   * @fires {CustomEvent<string>} base-changed - Base changed
   */
  notify(detail: string): void {
    this.dispatchEvent(new CustomEvent("base-changed", { detail }));
  }
}
`,
  );

  const exportsList = [`export * from "./base.js";`];
  for (let i = 0; i < count; i++) {
    const name = `BenchComp${i}`;
    write(
      root,
      `src/comp-${i}.ts`,
      `import { BenchBase } from "./base.js";

/**
 * Bench element ${i}.
 * @fires {CustomEvent<number>} item-changed - Fired when the item changes
 * @fires {CustomEvent<void>} item-reset - Fired on reset
 */
export class ${name} extends BenchBase {
  static observedAttributes = ["value", "label", "variant"];

  /** The numeric value. */
  value = ${i};

  /** The label text. */
  label: string = "item-${i}";

  /** Visual variant. */
  variant: "primary" | "secondary" | "ghost" = "primary";

  private _internal = ${i};

  /** Multiplies the value. @param factor The factor to apply. */
  scale(factor: number, round?: boolean): number {
    return round ? Math.round(this.value * factor) : this.value * factor;
  }

  /** Computed read/write property. */
  get computed(): number {
    return this.value * 2;
  }

  set computed(next: number) {
    this.value = next / 2;
  }

  reset(): void {
    this.value = ${i};
    this.dispatchEvent(new CustomEvent("item-reset"));
  }

  connectedCallback(): void {
    this._internal += 1;
  }
}

customElements.define("bench-comp-${i}", ${name});
`,
    );
    exportsList.push(`export * from "./comp-${i}.js";`);
  }
  write(root, "src/index.ts", `${exportsList.join("\n")}\n`);
}

/**
 * Half the files are elements, half are plain model classes whose only relation to elements is
 * the word `HTMLElement` in a comment. This is the workload candidate-aware prefetch targets.
 */
function mixedProject(root, count) {
  writeTsConfig(root);
  const components = Math.floor(count / 2);
  const models = count - components;

  for (let i = 0; i < components; i++) {
    write(
      root,
      `src/element-${i}.ts`,
      `/** Mixed project element ${i}. */
export class MixedElement${i} extends HTMLElement {
  /** The value. */
  value: number = ${i};

  /** The label. */
  label: string = "element-${i}";

  /** Doubles the value. */
  double(): number {
    return this.value * 2;
  }
}

customElements.define("mixed-element-${i}", MixedElement${i});
`,
    );
  }

  for (let i = 0; i < models; i++) {
    write(
      root,
      `src/model-${i}.ts`,
      `/** A plain model. The word HTMLElement appears only in this comment. */
export class Model${i} {
  /** Identifier. */
  id = ${i};

  /** Display name. */
  name = "model-${i}";

  /** Nested value. */
  nested = { a: ${i}, b: "${i}" };

  /** Optional note. */
  note?: string;

  /** Formats the model. */
  format(prefix: string): string {
    return prefix + this.name;
  }
}
`,
    );
  }
}

/**
 * Plain classes only, with `HTMLElement` in comments so the vanilla detector claims the files but
 * emits nothing. Every prefetched member type here is wasted work.
 */
function modelsOnlyProject(root, count) {
  writeTsConfig(root);
  for (let i = 0; i < count; i++) {
    write(
      root,
      `src/model-${i}.ts`,
      `/** A plain model. The word HTMLElement appears only in this comment. */
export class Model${i} {
  /** Identifier. */
  id = ${i};

  /** Display name. */
  name = "model-${i}";

  /** Nested value. */
  nested = { a: ${i}, b: "${i}" };

  /** Optional note. */
  note?: string;

  /** Formats the model. */
  format(prefix: string): string {
    return prefix + this.name;
  }
}
`,
    );
  }
}

/** Elements whose templates declare slots, CSS parts, and custom properties. */
function templateProject(root, count) {
  writeTsConfig(root);
  for (let i = 0; i < count; i++) {
    write(
      root,
      `src/template-${i}.ts`,
      `/** Template-heavy element ${i}. */
export class TemplateElement${i} extends HTMLElement {
  /** The title. */
  title = "template-${i}";

  static styles = \`
    :host { display: block; --panel-background: #fff; --panel-gap: 8px; }
    .panel { background: var(--panel-background); gap: var(--panel-gap); }
  \`;

  render() {
    return \`
      <!-- The header area -->
      <slot name="header"></slot>
      <div part="panel content">
        <slot></slot>
      </div>
      <footer part="footer"></footer>
    \`;
  }
}

customElements.define("template-element-${i}", TemplateElement${i});
`,
    );
  }
}

/** One element plus many ordinary stylesheets with no CEM documentation. */
function cssProject(root, count) {
  writeTsConfig(root);
  write(
    root,
    "src/element.ts",
    `/** The only element. */
export class CssProjectElement extends HTMLElement {
  /** A value. */
  value = 1;
}

customElements.define("css-project-element", CssProjectElement);
`,
  );
  for (let i = 0; i < count; i++) {
    write(
      root,
      `src/style-${i}.css`,
      `:host { display: block; color: rgb(${i % 255}, 0, 0); }
.panel-${i} { padding: 4px; }
`,
    );
  }
}

/** Elements with alias-heavy and inferred types that need checker expansion. */
function complexTypesProject(root, count) {
  writeTsConfig(root);
  write(
    root,
    "src/types.ts",
    `export type Variant = "primary" | "secondary" | "ghost";
export interface Config { mode: "compact" | "full"; depth?: number }
export type Item = { id: string; value: number };
export type Handler = (item: Item) => void;
`,
  );
  for (let i = 0; i < count; i++) {
    write(
      root,
      `src/complex-${i}.ts`,
      `import type { Config, Handler, Item, Variant } from "./types.js";

/** Complex element ${i}. */
export class ComplexElement${i} extends HTMLElement {
  /** Visual variant. */
  variant: Variant = "primary";

  /** Configuration. */
  config: Config = { mode: "full" };

  /** Selection handler. */
  onSelect: Handler = () => {};

  /** Items. */
  items: Item[] = [];

  /** Union of accepted values. */
  value: string | number | null = null;

  /** Returns a variant for an item. */
  resolve(item: Item): Variant {
    return item.value > ${i} ? "primary" : "secondary";
  }

  /** Emits the current selection. */
  emit(detail: Item & { source: string }): void {
    this.dispatchEvent(new CustomEvent("select", { detail }));
  }
}

customElements.define("complex-element-${i}", ComplexElement${i});
`,
    );
  }
}

export const FIXTURES = {
  "components-50": (root) => simpleComponents(root, 50),
  "components-200": (root) => simpleComponents(root, 200),
  "components-500": (root) => simpleComponents(root, 500),
  "mixed-300": (root) => mixedProject(root, 300),
  "models-300": (root) => modelsOnlyProject(root, 300),
  "template-100": (root) => templateProject(root, 100),
  "css-200": (root) => cssProject(root, 200),
  "complex-50": (root) => complexTypesProject(root, 50),
};

/** Builds any missing fixtures under `rootDir` and returns their tsconfig paths. */
export function ensureFixtures(rootDir, names = Object.keys(FIXTURES)) {
  const fixtures = [];
  for (const name of names) {
    const build = FIXTURES[name];
    if (!build) throw new Error(`Unknown fixture: ${name}`);
    const directory = path.join(rootDir, name);
    const marker = path.join(directory, ".complete");
    if (!fs.existsSync(marker)) {
      fs.rmSync(directory, { recursive: true, force: true });
      fs.mkdirSync(directory, { recursive: true });
      build(directory);
      fs.writeFileSync(marker, "");
    }
    fixtures.push({ name, tsConfigPath: path.join(directory, "tsconfig.json") });
  }
  return fixtures;
}
