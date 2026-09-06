import type { AnnotatorPlugin, ClassFragment, InternalManifest, OmitInheritedMap } from "./types.js";
import { resolveInheritedCollection, type InheritableCollectionKey } from "@cem-generator/core-utils";

export interface InheritancePluginOptions {
  include?: InheritableCollectionKey[];
  ignore?: InheritableCollectionKey[];
  omitByKind?: OmitInheritedMap;
  omitByClassName?: Record<string, OmitInheritedMap>;
  metadataField?: string;
  externalManifests?: unknown[];
  includeExternalManifests?: boolean;
}

const ALL_KEYS: InheritableCollectionKey[] = [
  "members",
  "attributes",
  "cssProperties",
  "cssParts",
  "cssStates",
  "slots",
  "events",
];

export function inheritancePlugin(options: InheritancePluginOptions = {}): AnnotatorPlugin {
  return {
    name: "inheritance",
    afterManifest(manifest: Readonly<InternalManifest>) {
      return buildInheritancePatch(manifest, options);
    },
  };
}

export function buildInheritancePatch(
  manifest: Readonly<InternalManifest>,
  options: InheritancePluginOptions = {}
): { replaceByDeclaration: Record<string, Partial<ClassFragment>> } {
  const include = options.include?.length ? options.include : ALL_KEYS;
  const ignoreSet = new Set(options.ignore ?? []);

  const declarations = manifest.modules.flatMap((mod) => mod.declarations.map((decl) => ({ mod, decl })));
  const byRef = new Map<string, ClassFragment>();

  for (const { mod, decl } of declarations) {
    byRef.set(refKey({ name: decl.name, module: mod.path }), decl);
    byRef.set(refKey({ name: decl.name }), decl);
  }

  indexExternalManifests(byRef, options.externalManifests);

  const findByRef = (ref: { name: string; module?: string }): ClassFragment | undefined => {
    if (ref.module) {
      const exact = byRef.get(refKey(ref));
      if (exact) return exact;
    }
    return byRef.get(refKey({ name: ref.name }));
  };

  const replaceByDeclaration: Record<string, Partial<ClassFragment>> = {};

  for (const { mod, decl } of declarations) {
    if (!decl.superclass) continue;

    const replacement: Partial<ClassFragment> = {};

    for (const key of include) {
      if (ignoreSet.has(key)) continue;
      const current = Array.isArray(decl[key]) ? decl[key] : [];

      const merged = resolveInheritedCollection(findByRef, decl, key, undefined, undefined, {
        omit: {
          byKind: options.omitByKind,
          byClassName: options.omitByClassName,
          metadataField: options.metadataField,
        },
      });

      if ((merged.length > 0 || Array.isArray(decl[key])) && !sameArrayShallow(current, merged)) {
        (replacement as Record<string, unknown>)[key] = merged;
      }
    }

    if (Object.keys(replacement).length > 0) {
      replaceByDeclaration[`${mod.path}#${decl.name}`] = replacement;
    }
  }

  return { replaceByDeclaration };
}

function indexExternalManifests(byRef: Map<string, ClassFragment>, externalManifests: unknown[] | undefined) {
  const addIfMissing = (key: string, value: ClassFragment) => {
    if (!byRef.has(key)) byRef.set(key, value);
  };

  for (const manifest of externalManifests ?? []) {
    const manifestObj = asRecord(manifest);
    if (!manifestObj) continue;

    const modules = Array.isArray(manifestObj.modules) ? manifestObj.modules : [];
    for (const mod of modules) {
      const modObj = asRecord(mod);
      if (!modObj) continue;

      const modulePath = asString(modObj.path);
      const declarations = Array.isArray(modObj.declarations) ? modObj.declarations : [];
      for (const decl of declarations) {
        const normalized = normalizeExternalDeclaration(decl, modulePath);
        if (!normalized) continue;
        if (normalized.module) {
          addIfMissing(refKey({ name: normalized.name, module: normalized.module }), normalized);
        }
        addIfMissing(refKey({ name: normalized.name }), normalized);
      }
    }
  }
}

export function extractExternalModules(
  externalManifests: unknown[] | undefined,
  { onlyCustomElements = true }: { onlyCustomElements?: boolean } = {}
): InternalManifest["modules"] {
  const out: InternalManifest["modules"] = [];

  for (const manifest of externalManifests ?? []) {
    const manifestObj = asRecord(manifest);
    if (!manifestObj) continue;

    const modules = Array.isArray(manifestObj.modules) ? manifestObj.modules : [];
    for (const mod of modules) {
      const modObj = asRecord(mod);
      if (!modObj) continue;

      const modulePath = asString(modObj.path);
      if (!modulePath) continue;

      const declarations = Array.isArray(modObj.declarations) ? modObj.declarations : [];
      const normalized = declarations
        .map((decl) => normalizeExternalDeclaration(decl, modulePath))
        .filter((decl): decl is ClassFragment => !!decl)
        .filter((decl) => {
          if (!onlyCustomElements) return true;
          const rec = decl as Record<string, unknown>;
          return asBoolean(rec.customElement) === true || typeof rec.tagName === "string";
        });

      if (normalized.length > 0) {
        out.push({ path: modulePath, declarations: normalized });
      }
    }
  }

  return out;
}

function normalizeExternalDeclaration(decl: unknown, modulePath?: string): ClassFragment | undefined {
  const rec = asRecord(decl);
  if (!rec) return undefined;
  const name = asString(rec.name);
  if (!name) return undefined;

  const kind = asString(rec.kind);
  const customElement = asBoolean(rec.customElement);
  const tagName = asString(rec.tagName);

  return {
    name,
    module: modulePath,
    ...(kind ? { kind } : {}),
    ...(customElement !== undefined ? { customElement } : {}),
    ...(tagName ? { tagName } : {}),
    superclass: normalizeSuperclass(rec.superclass),
    members: normalizeNamedCollection(rec.members),
    attributes: normalizeNamedCollection(rec.attributes),
    cssProperties: normalizeNamedCollection(rec.cssProperties),
    cssParts: normalizeNamedCollection(rec.cssParts),
    cssStates: normalizeNamedCollection(rec.cssStates),
    slots: normalizeNamedCollection(rec.slots),
    events: normalizeNamedCollection(rec.events),
  };
}

function normalizeSuperclass(value: unknown): ClassFragment["superclass"] {
  const rec = asRecord(value);
  if (!rec) return undefined;
  const name = asString(rec.name);
  if (!name) return undefined;
  return { name, module: asString(rec.module) };
}

function normalizeNamedCollection(value: unknown): Array<{ name: string; [key: string]: unknown }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<{ name: string; [key: string]: unknown }> = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (!rec) continue;
    const name = asString(rec.name);
    if (!name) continue;
    out.push({ ...rec, name });
  }
  return out.length > 0 ? out : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function refKey(ref: { name: string; module?: string }): string {
  return `${ref.module ?? ""}#${ref.name}`;
}

function sameArrayShallow(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
  }
  return true;
}
