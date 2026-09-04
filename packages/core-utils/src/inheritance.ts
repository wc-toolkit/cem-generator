export interface SuperclassRef {
  name: string;
  module?: string;
}

export type InheritableCollectionKey =
  | "members"
  | "attributes"
  | "cssProperties"
  | "cssParts"
  | "cssStates"
  | "slots"
  | "events";

export type InheritanceOmitMap = Partial<Record<InheritableCollectionKey, string[]>>;

export interface InheritanceOmitConfig {
  byKind?: InheritanceOmitMap;
  byClassName?: Record<string, InheritanceOmitMap>;
  /**
   * Optional class field name that stores per-declaration omit metadata.
   * Defaults to `omitInherited`.
   */
  metadataField?: string;
}

export interface ResolveInheritedOptions {
  omit?: InheritanceOmitConfig;
}

export interface InheritableMember {
  name: string;
  inheritedFrom?: { name: string; module?: string };
  [key: string]: unknown;
}

export interface ClassLike {
  name: string;
  module?: string;
  superclass?: SuperclassRef;
  members?: InheritableMember[];
  attributes?: InheritableMember[];
  cssProperties?: InheritableMember[];
  cssParts?: InheritableMember[];
  cssStates?: InheritableMember[];
  slots?: InheritableMember[];
  events?: InheritableMember[];
  omitInherited?: InheritanceOmitMap;
  [key: string]: unknown;
}

/**
 * Resolves inherited members/attributes across a superclass chain.
 *
 * Deliberately NOT a dependency graph / topo sort — memoized recursion is
 * sufficient because the full manifest is already available by the time
 * this runs (in an `afterAllFiles` hook), and a self-extension guard makes
 * circular-superclass references fail loudly instead of infinite-looping.
 */
export function resolveInheritedCollection<K extends InheritableCollectionKey>(
  findByRef: (ref: SuperclassRef) => ClassLike | undefined,
  decl: ClassLike,
  key: K,
  resolved: Map<string, InheritableMember[]> = new Map(),
  inProgress: Set<string> = new Set(),
  options?: ResolveInheritedOptions
): InheritableMember[] {
  const omitted = getOmittedNamesForClass(decl, key, options?.omit);
  const omitCacheKey = omitted.size ? [...omitted].sort().join("|") : "";
  const cacheKey = `${key}:${decl.name}:${omitCacheKey}`;
  if (resolved.has(cacheKey)) return resolved.get(cacheKey)!;

  if (inProgress.has(decl.name)) {
    throw new Error(
      `Circular superclass reference detected while resolving "${decl.name}". ` +
        `Check for a class that (directly or transitively) extends itself.`
    );
  }
  inProgress.add(decl.name);

  const own = decl[key] ?? [];
  const base = decl.superclass && findByRef(decl.superclass);

  const baseCollection = base
    ? resolveInheritedCollection(findByRef, base, key, resolved, inProgress, options)
    : [];

  const ownNames = new Set(own.map((m) => m.name));
  const merged = [
    ...baseCollection
      .filter((m) => !ownNames.has(m.name) && !omitted.has(m.name))
      .map((m) => ({
        ...m,
        inheritedFrom: m.inheritedFrom ?? { name: base!.name, module: base!.module },
      })),
    ...own,
  ];

  inProgress.delete(decl.name);
  resolved.set(cacheKey, merged);
  return merged;
}

function getOmittedNamesForClass(
  decl: ClassLike,
  key: InheritableCollectionKey,
  omitConfig: InheritanceOmitConfig | undefined
): Set<string> {
  const names = new Set<string>();

  const add = (values: string[] | undefined) => {
    for (const value of values ?? []) {
      const cleaned = value.trim();
      if (cleaned) names.add(cleaned);
    }
  };

  add(omitConfig?.byKind?.[key]);
  add(omitConfig?.byClassName?.[decl.name]?.[key]);

  const metadataField = omitConfig?.metadataField ?? "omitInherited";
  const metadata = readOmitMap((decl as Record<string, unknown>)[metadataField]);
  add(metadata?.[key]);

  if (metadataField !== "omitInherited") {
    add(readOmitMap((decl as Record<string, unknown>).omitInherited)?.[key]);
  }

  return names;
}

function readOmitMap(value: unknown): InheritanceOmitMap | undefined {
  if (!value || typeof value !== "object") return undefined;

  const out: InheritanceOmitMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isInheritableCollectionKey(key) || !Array.isArray(raw)) continue;
    const values = raw.filter((entry): entry is string => typeof entry === "string");
    if (values.length) out[key] = values;
  }
  return out;
}

function isInheritableCollectionKey(key: string): key is InheritableCollectionKey {
  return ["members", "attributes", "cssProperties", "cssParts", "cssStates", "slots", "events"].includes(
    key
  );
}
