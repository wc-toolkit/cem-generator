import type ts from "typescript";
import {
  ClassFragment,
  InternalManifest,
  DetectorPlugin,
  AnnotatorPlugin,
  FileContext,
  Plugin,
  isDetectorPlugin,
  isAnnotatorPlugin,
} from "./types.js";
import type { ProgramResult } from "./program.js";
import { vanillaBuiltin } from "./vanilla-builtin.js";
import type {
  Package as CemPackage,
  JavaScriptModule,
  CustomElementDeclaration,
  Attribute,
  JavaScriptExport,
  Event,
  Slot,
  CssCustomProperty,
  CssPart,
  CssCustomState,
  ClassField,
  ClassMethod,
  Parameter,
  Type as CemType,
} from "custom-elements-manifest/schema";

export const TARGET_CEM_SCHEMA_VERSION = "2.1.0";

export interface RunOptions {
  /** Additional plugins beyond the built-in vanilla detector. */
  plugins?: Plugin[];
  /**
   * How to handle conflicting detector values for the same class field.
   *
   * - throw: fail fast on non-equal conflicts (default)
   * - last-wins: preserve previous behavior
   */
  detectorConflictPolicy?: "throw" | "last-wins";
}

export function runPipeline(
  { program, checker, sourceFiles }: ProgramResult,
  { plugins = [], detectorConflictPolicy = "throw" }: RunOptions = {}
): CemPackage {
  // Vanilla HTMLElement detection is core functionality, not a plugin —
  // every project has vanilla components even if it also uses a framework,
  // so this always runs rather than requiring an install/opt-in.
  const allPlugins: Plugin[] = [vanillaBuiltin(), ...plugins];

  const detectors = allPlugins.filter(isDetectorPlugin);
  const annotators = allPlugins.filter(isAnnotatorPlugin);

  const manifest: InternalManifest = { schemaVersion: TARGET_CEM_SCHEMA_VERSION, modules: [] };

  for (const sourceFile of sourceFiles) {
    const moduleDeclarations = analyzeFile(sourceFile, checker, detectors, detectorConflictPolicy);
    if (moduleDeclarations.length > 0) {
      manifest.modules.push({ path: sourceFile.fileName, declarations: moduleDeclarations });
    }
  }

  applyDetectorAfterAllFiles(manifest, detectors);

  applyAnnotators(manifest, annotators);

  return toCemPackage(manifest);
}

function analyzeFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  detectors: DetectorPlugin[],
  detectorConflictPolicy: "throw" | "last-wins"
): ClassFragment[] {
  const sourceText = sourceFile.getFullText();
  const context: FileContext = { filePath: sourceFile.fileName, sourceText, sourceFile, checker };
  const claimedByPlugin = new Map<DetectorPlugin, boolean>();

  function claimed(plugin: DetectorPlugin): boolean {
    if (claimedByPlugin.has(plugin)) return claimedByPlugin.get(plugin)!;
    const value = plugin.claims(sourceText, sourceFile.fileName);
    claimedByPlugin.set(plugin, value);
    return value;
  }

  // merged[className] accumulates fragments from every plugin that claims
  // this file.
  const merged: Record<string, ClassFragment> = {};
  const fieldOwners: Record<string, Record<string, string>> = {};

  for (const plugin of detectors) {
    if (!claimed(plugin)) continue;

    const fragment = plugin.onFile(context);
    for (const [className, classFragment] of Object.entries(fragment)) {
      const target = (merged[className] ??= { name: className });
      const owners = (fieldOwners[className] ??= {});

      mergeClassFragment({
        className,
        target,
        incoming: classFragment,
        pluginName: plugin.name,
        owners,
        detectorConflictPolicy,
      });
    }
  }

  for (const plugin of detectors) {
    if (!plugin.afterFile) continue;
    if (!claimed(plugin)) continue;
    for (const className of Object.keys(merged)) {
      const updated = plugin.afterFile(context, merged[className]);
      if (updated) merged[className] = updated;
    }
  }

  return Object.values(merged);
}

function mergeClassFragment({
  className,
  target,
  incoming,
  pluginName,
  owners,
  detectorConflictPolicy,
}: {
  className: string;
  target: ClassFragment;
  incoming: ClassFragment;
  pluginName: string;
  owners: Record<string, string>;
  detectorConflictPolicy: "throw" | "last-wins";
}) {
  for (const [field, incomingValue] of Object.entries(incoming)) {
    if (field === "name" || incomingValue === undefined) continue;

    const currentValue = (target as Record<string, unknown>)[field];
    const hasCurrentValue = currentValue !== undefined;
    const hasConflict = hasCurrentValue && !deepEqual(currentValue, incomingValue);

    if (hasConflict && detectorConflictPolicy === "throw") {
      const previousPlugin = owners[field] ?? "(unknown)";
      throw new Error(
        `Detector conflict on "${className}.${field}": plugin "${previousPlugin}" and ` +
          `"${pluginName}" produced different values. ` +
          `Set detectorConflictPolicy: "last-wins" to allow overrides.`
      );
    }

    if (!hasCurrentValue || detectorConflictPolicy === "last-wins") {
      (target as Record<string, unknown>)[field] = incomingValue;
      owners[field] = pluginName;
    }
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }

  return true;
}

function applyDetectorAfterAllFiles(manifest: InternalManifest, detectors: DetectorPlugin[]) {
  for (const detector of detectors) {
    if (!detector.afterAllFiles) continue;
    const patch = detector.afterAllFiles(manifest);
    applyManifestPatch(manifest, detector.name, patch, "Detector");
  }
}

function applyAnnotators(manifest: InternalManifest, annotators: AnnotatorPlugin[]) {
  for (const plugin of annotators) {
    const patch = plugin.afterManifest(manifest);
    applyManifestPatch(manifest, plugin.name, patch, "Annotator");
  }
}

function applyManifestPatch(
  manifest: InternalManifest,
  pluginName: string,
  patch: Record<string, Partial<ClassFragment>> | { byDeclaration?: Record<string, Partial<ClassFragment>>; byClassName?: Record<string, Partial<ClassFragment>> },
  pluginKind: "Detector" | "Annotator"
) {
  const declarationByKey = new Map<string, ClassFragment>();
  for (const mod of manifest.modules) {
    for (const decl of mod.declarations) {
      declarationByKey.set(`${mod.path}#${decl.name}`, decl);
    }
  }

  const isStructuredPatch =
    !!patch && typeof patch === "object" && ("byDeclaration" in patch || "byClassName" in patch);

  const byDeclaration = isStructuredPatch && "byDeclaration" in patch ? patch.byDeclaration ?? {} : {};
  const byClassName =
    isStructuredPatch && "byClassName" in patch
      ? patch.byClassName ?? {}
      : (patch as Record<string, Partial<ClassFragment>>);

  for (const [declarationKey, patchForClass] of Object.entries(byDeclaration)) {
    const decl = declarationByKey.get(declarationKey);
    if (!decl || !patchForClass) continue;
    applyAdditivePatch(pluginKind, pluginName, decl, patchForClass);
  }

  for (const mod of manifest.modules) {
    for (const decl of mod.declarations) {
      const patchForClass = byClassName[decl.name];
      if (!patchForClass) continue;
      applyAdditivePatch(pluginKind, pluginName, decl, patchForClass);
    }
  }
}

function toCemPackage(internal: InternalManifest): CemPackage {
  const modules: JavaScriptModule[] = internal.modules.map((mod) => {
    const declarations: CustomElementDeclaration[] = mod.declarations.map((decl) =>
      toCustomElementDeclaration(decl)
    );
    const jsExports: JavaScriptExport[] = mod.declarations
      .filter((decl) => !!asString(decl.exportName))
      .map((decl) => ({
        kind: "js",
        name: asString(decl.exportName)!,
        declaration: { name: decl.name, module: mod.path },
      }));

    return {
      kind: "javascript-module",
      path: mod.path,
      declarations,
      exports: [
        ...jsExports,
        ...declarations
          .filter((decl) => !!decl.tagName)
          .map((decl) => ({
            kind: "custom-element-definition" as const,
            name: decl.tagName!,
            declaration: { name: decl.name, module: mod.path },
          })),
      ],
    };
  });

  return {
    schemaVersion: TARGET_CEM_SCHEMA_VERSION,
    modules,
  };
}

function toCustomElementDeclaration(fragment: ClassFragment): CustomElementDeclaration {
  const known = {
    kind: "class",
    customElement: true,
    name: fragment.name,
    description: asString(fragment.description),
    summary: asString(fragment.summary),
    deprecated: asDeprecated(fragment.deprecated),
    tagName: asString(fragment.tagName),
    superclass: fragment.superclass
      ? {
          name: fragment.superclass.name,
          module: asString(fragment.superclass.module),
        }
      : undefined,
    members: toMembers(fragment),
    attributes: toAttributes(fragment.attributes),
    events: toEvents(fragment.events),
    slots: toSlots(fragment.slots),
    cssProperties: toCssProperties(fragment.cssProperties),
    cssParts: toCssParts(fragment.cssParts),
    cssStates: toCssStates(fragment.cssStates),
  };

  const extraFields = Object.fromEntries(
    Object.entries(fragment).filter(
      ([key]) =>
        ![
          "name",
          "module",
          "exportName",
          "tagName",
          "summary",
          "deprecated",
          "superclass",
          "members",
          "attributes",
          "cssProperties",
          "cssParts",
          "cssStates",
          "slots",
          "events",
          "description",
        ].includes(key)
    )
  );

  return { ...(known as Record<string, unknown>), ...extraFields } as unknown as CustomElementDeclaration;
}

function toMembers(fragment: ClassFragment): Array<ClassField | ClassMethod> | undefined {
  if (!fragment.members?.length) return undefined;
  const converted = fragment.members
    .map((member) => {
      const kind = asString(member.kind) === "method" ? "method" : "field";
      if (kind === "method") {
        const method: ClassMethod = {
          kind: "method",
          name: member.name,
          description: asString(member.description),
          summary: asString(member.summary),
          deprecated: asDeprecated(member.deprecated),
          privacy: asPrivacy(member.privacy),
          static: asBoolean(member.static),
          parameters: toParameters(member.parameters),
          return: toMethodReturn(member.return),
          ...(toType((member as Record<string, unknown>).parsedType)
            ? {
                "parsedType": toType((member as Record<string, unknown>).parsedType),
              }
            : {}),
        };
        return method;
      }

      const field: ClassField = {
        kind: "field",
        name: member.name,
        description: asString(member.description),
        summary: asString(member.summary),
        deprecated: asDeprecated(member.deprecated),
        privacy: asPrivacy(member.privacy),
        static: asBoolean(member.static),
        readonly: asBoolean(member.readonly),
        default: asString(member.default),
        type: toType(member.type),
        ...(toType((member as Record<string, unknown>).parsedType)
          ? {
              "parsedType": toType((member as Record<string, unknown>).parsedType),
            }
          : {}),
      };
      return field;
    })
    .filter(Boolean);

  return converted.length ? converted : undefined;
}

function toAttributes(
  attributes: ClassFragment["attributes"]
): Attribute[] | undefined {
  if (!attributes?.length) return undefined;
  const converted = attributes
    .map((attr) => ({
      name: attr.name,
      description: asString(attr.description),
      summary: asString(attr.summary),
      deprecated: asDeprecated(attr.deprecated),
      type: toType(attr.type),
      ...(toType((attr as Record<string, unknown>).parsedType)
        ? {
            "parsedType": toType((attr as Record<string, unknown>).parsedType),
          }
        : {}),
      default: asString((attr as Record<string, unknown>).default),
      fieldName: asString((attr as Record<string, unknown>).fieldName),
    }))
    .filter((attr) => !!attr.name);

  return converted.length ? converted : undefined;
}

function toEvents(events: ClassFragment["events"]): Event[] | undefined {
  if (!events?.length) return undefined;
  const converted = events
    .map((event) => ({
      name: event.name,
      description: asString(event.description),
      summary: asString(event.summary),
      deprecated: asDeprecated(event.deprecated),
      type: toType(event.type) ?? { text: "Event" },
      ...(toType((event as Record<string, unknown>).parsedType)
        ? {
            "parsedType": toType((event as Record<string, unknown>).parsedType),
          }
        : {}),
    }))
    .filter((event) => !!event.name);

  return converted.length ? converted : undefined;
}

function toSlots(slots: ClassFragment["slots"]): Slot[] | undefined {
  if (!slots?.length) return undefined;
  const converted = slots.map((slot) => ({
    name: slot.name,
    description: asString(slot.description),
    summary: asString(slot.summary),
    deprecated: asDeprecated(slot.deprecated),
  }));
  return converted.length ? converted : undefined;
}

function toCssProperties(
  cssProperties: ClassFragment["cssProperties"]
): CssCustomProperty[] | undefined {
  if (!cssProperties?.length) return undefined;
  const converted = cssProperties.map((prop) => ({
    name: prop.name,
    description: asString(prop.description),
    summary: asString(prop.summary),
    deprecated: asDeprecated(prop.deprecated),
    default: asString(prop.default),
    syntax: asString(prop.syntax),
  }));
  return converted.length ? converted : undefined;
}

function toCssParts(cssParts: ClassFragment["cssParts"]): CssPart[] | undefined {
  if (!cssParts?.length) return undefined;
  const converted = cssParts.map((part) => ({
    name: part.name,
    description: asString(part.description),
    summary: asString(part.summary),
    deprecated: asDeprecated(part.deprecated),
  }));
  return converted.length ? converted : undefined;
}

function toCssStates(cssStates: ClassFragment["cssStates"]): CssCustomState[] | undefined {
  if (!cssStates?.length) return undefined;
  const converted = cssStates.map((state) => ({
    name: state.name,
    description: asString(state.description),
    summary: asString(state.summary),
    deprecated: asDeprecated(state.deprecated),
  }));
  return converted.length ? converted : undefined;
}

function toType(value: unknown): CemType | undefined {
  const text = asString(value);
  return text ? { text } : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asDeprecated(value: unknown): boolean | string | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function asPrivacy(value: unknown): "public" | "private" | "protected" | undefined {
  return value === "public" || value === "private" || value === "protected" ? value : undefined;
}

function toParameters(params: unknown): Parameter[] | undefined {
  if (!Array.isArray(params) || params.length === 0) return undefined;
  const converted: Parameter[] = [];
  for (const p of params) {
    const rec = p as Record<string, unknown>;
    const name = asString(rec.name);
    if (!name) continue;
    converted.push({
      name,
      type: toType(rec.type),
      ...(toType(rec.parsedType)
        ? {
            "parsedType": toType(rec.parsedType),
          }
        : {}),
      optional: asBoolean(rec.optional),
      rest: asBoolean(rec.rest),
      default: asString(rec.default),
    });
  }
  return converted.length ? converted : undefined;
}

function toMethodReturn(value: unknown): { type?: CemType; description?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const type = toType(rec.type);
  const description = asString(rec.description);
  const parsedType = toType(rec.parsedType);
  if (!type && !description && !parsedType) return undefined;
  return {
    type,
    ...(parsedType ? { "parsedType": parsedType } : {}),
    description,
  };
}

function applyAdditivePatch(
  pluginKind: "Detector" | "Annotator",
  pluginName: string,
  decl: ClassFragment,
  patchForClass: Partial<ClassFragment>
) {
  for (const [field, value] of Object.entries(patchForClass)) {
    if (field in decl) {
      throw new Error(
        `${pluginKind} plugin "${pluginName}" attempted to overwrite existing field ` +
          `"${field}" on "${decl.name}". Patches may only add new fields.`
      );
    }
    (decl as Record<string, unknown>)[field] = value;
  }
}
