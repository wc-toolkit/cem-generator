import ts from "typescript";

export interface JSDocTagInfo {
  tagName: string;
  text: string;
}

export interface JSDocInfo {
  description: string;
  tags: JSDocTagInfo[];
}

export interface ParsedJSDocMemberInfo {
  attribute?: string;
  attributeFromFieldName?: boolean;
  reflects?: boolean;
  internal?: boolean;
  default?: string;
  summary?: string;
  deprecated?: boolean | string;
  customJsDocTags?: Array<{ name: string; text: string }>;
}

export interface ParsedJSDocClassInfo {
  summary?: string;
  tagName?: string;
  deprecated?: boolean | string;
  slots?: Array<{ name: string; description?: string }>;
  cssProperties?: Array<{ name: string; description?: string; default?: string }>;
  cssParts?: Array<{ name: string; description?: string }>;
  cssStates?: Array<{ name: string; description?: string }>;
  attributes?: Array<{ name: string; description?: string; type?: string }>;
  properties?: Array<{ name: string; description?: string; type?: string }>;
  events?: Array<{ name: string; description?: string; type?: string }>;
  omitInherited?: {
    members?: string[];
    attributes?: string[];
    cssProperties?: string[];
    cssParts?: string[];
    cssStates?: string[];
    slots?: string[];
    events?: string[];
  };
  customJsDocTags?: Array<{ name: string; text: string }>;
}

/**
 * Extracts structured JSDoc info (description + tags) from a declaration node
 * using TS's own JSDoc parser, rather than regex-scraping comment text.
 *
 * Shared across every framework plugin — this is exactly the kind of logic
 * that should live once in core-utils instead of being reimplemented per
 * plugin (a known pain point in the original CEM analyzer's built-in
 * framework handlers).
 */
export function getJSDocInfo(node: ts.Node): JSDocInfo {
  const tags = ts.getJSDocTags(node).map((tag) => ({
    tagName: tag.tagName.text,
    text:
      typeof tag.comment === "string" ? tag.comment : (ts.getTextOfJSDocComment(tag.comment) ?? ""),
  }));

  const description = ts.getJSDocCommentsAndTags(node).find(ts.isJSDoc)?.comment;

  return {
    description:
      typeof description === "string" ? description : (ts.getTextOfJSDocComment(description) ?? ""),
    tags,
  };
}

/** Convenience: find every tag of a given name (e.g. all `@fires` tags). */
export function getJSDocTagsNamed(node: ts.Node, tagName: string): JSDocTagInfo[] {
  return getJSDocInfo(node).tags.filter((t) => t.tagName === tagName);
}

/**
 * Tags that already map to dedicated manifest fields (or the leading
 * description). Any other tag is preserved as-is so devs can attach custom
 * metadata without writing a plugin.
 */
const RESERVED_JSDOC_TAGS = new Set([
  "attribute",
  "attrs",
  "comment",
  "csspart",
  "cssproperty",
  "cssprop",
  "cssState",
  "default",
  "deprecated",
  "description",
  "event",
  "fires",
  "ignore",
  "internal",
  "omit",
  "omit-attr",
  "omit-attribute",
  "omit-csspart",
  "omit-cssproperty",
  "omit-cssprop",
  "omit-cssState",
  "omit-cssstate",
  "omit-event",
  "omit-method",
  "omit-part",
  "omit-slot",
  "part",
  "property",
  "prop",
  "reflect",
  "slot",
  "summary",
  "tag",
  "tagname",
]);

/** Collects tags that don't map to a built-in manifest field. */
function collectCustomJsDocTags(node: ts.Node): Array<{ name: string; text: string }> | undefined {
  const custom = getJSDocInfo(node)
    .tags.filter((t) => !RESERVED_JSDOC_TAGS.has(t.tagName))
    .map((t) => ({ name: t.tagName, text: t.text }));
  return custom.length ? custom : undefined;
}

export function parseCemClassTags(node: ts.Node): ParsedJSDocClassInfo {
  const tags = getJSDocInfo(node).tags;

  const attributes = tags
    .filter((t) => t.tagName === "attr" || t.tagName === "attribute")
    .map((t) => parseTypedNamedTag(t.text))
    .filter((t): t is { name: string; description?: string; type?: string } => !!t?.name);

  const properties = tags
    .filter((t) => t.tagName === "prop" || t.tagName === "property")
    .map((t) => parseTypedNamedTag(t.text))
    .filter((t): t is { name: string; description?: string; type?: string } => !!t?.name);

  const slots = tags
    .filter((t) => t.tagName === "slot")
    .map((t) => parseSlotTag(t.text))
    .filter((t): t is { name: string; description?: string } => t !== undefined);

  const cssProperties = tags
    .filter((t) => t.tagName === "cssprop" || t.tagName === "cssproperty")
    .map((t) => parseCssPropertyTag(t.text))
    .filter((t): t is { name: string; description?: string; default?: string } => !!t?.name);

  const cssParts = tags
    .filter((t) => t.tagName === "part" || t.tagName === "csspart")
    .map((t) => parseNamedTag(t.text))
    .filter((t): t is { name: string; description?: string } => !!t?.name);

  const cssStates = tags
    .filter((t) => t.tagName === "cssState")
    .map((t) => parseNamedTag(t.text))
    .filter((t): t is { name: string; description?: string } => !!t?.name);

  const events = tags
    .filter((t) => t.tagName === "fires" || t.tagName === "event")
    .map((t) => parseEventTag(t.text))
    .filter((t): t is { name: string; description?: string; type?: string } => !!t?.name);

  const omitInherited = parseOmitInheritedTags(tags);

  return {
    summary: firstTagValue(tags, ["summary"]),
    tagName: firstTagValue(tags, ["tag", "tagname"]),
    deprecated: readDeprecatedTag(tags),
    attributes: attributes.length ? attributes : undefined,
    properties: properties.length ? properties : undefined,
    slots: slots.length ? slots : undefined,
    cssProperties: cssProperties.length ? cssProperties : undefined,
    cssParts: cssParts.length ? cssParts : undefined,
    cssStates: cssStates.length ? cssStates : undefined,
    events: events.length ? events : undefined,
    omitInherited,
    customJsDocTags: collectCustomJsDocTags(node),
  };
}

export function parseCemMemberTags(node: ts.Node): ParsedJSDocMemberInfo {
  const tags = getJSDocInfo(node).tags;

  const attrTag = tags.find((t) => t.tagName === "attr" || t.tagName === "attribute");
  const reflectTag = tags.find((t) => t.tagName === "reflect");
  const internalTag = tags.find((t) => t.tagName === "internal" || t.tagName === "ignore");
  const defaultTag = tags.find((t) => t.tagName === "default")?.text.trim();

  const attrInfo = attrTag ? parseNamedTag(attrTag.text) : undefined;
  const bareAttributeTag = !!attrTag && !attrTag.text.trim();

  return {
    attribute: attrInfo?.name,
    attributeFromFieldName: bareAttributeTag,
    reflects: reflectTag ? true : undefined,
    internal: internalTag ? true : undefined,
    default: defaultTag || undefined,
    summary: firstTagValue(tags, ["summary"]),
    deprecated: readDeprecatedTag(tags),
    customJsDocTags: collectCustomJsDocTags(node),
  };
}

function readDeprecatedTag(tags: JSDocTagInfo[]): boolean | string | undefined {
  const raw = tags.find((t) => t.tagName === "deprecated")?.text.trim();
  if (raw === undefined) return undefined;
  return raw ? raw : true;
}

function firstTagValue(tags: JSDocTagInfo[], names: string[]): string | undefined {
  const value = tags.find((t) => names.includes(t.tagName))?.text.trim();
  return value || undefined;
}

function stripLeadingType(text: string): string {
  return readLeadingType(text).rest.trim();
}

function readLeadingType(text: string): { type?: string; rest: string } {
  const start = text.search(/\{/);
  if (start < 0 || text.slice(0, start).trim()) return { rest: text };

  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) {
      return {
        type: text.slice(start + 1, index).trim() || undefined,
        rest: text.slice(index + 1),
      };
    }
  }

  return { rest: text };
}

function parseNamedTag(rawText: string): { name?: string; description?: string } | undefined {
  const text = stripLeadingType(rawText);
  if (!text) return undefined;

  const sep = text.match(/\s+-\s+/);
  if (sep?.index !== undefined) {
    const name = text.slice(0, sep.index).trim();
    const description = text.slice(sep.index + sep[0].length).trim();
    return name ? { name, description: description || undefined } : undefined;
  }

  const [name, ...rest] = text.split(/\s+/);
  return name ? { name, description: rest.join(" ") || undefined } : undefined;
}

/**
 * Parses the value of a custom JSDoc tag into structured metadata:
 * `{Type} name - description`, `[name=default] - description`, or a bare value.
 * Used for preserved custom tags so `@status beta - not ready for production`
 * becomes `{ name: "beta", description: "not ready for production" }`.
 */
export function parseCustomTagValue(
  rawText: string,
): { name?: string; description?: string; default?: string; type?: string } | undefined {
  const { type, rest } = readLeadingType(rawText);
  const text = rest.trim();
  if (!text) return type ? { type } : undefined;

  if (text.startsWith("[")) {
    const end = text.indexOf("]");
    if (end > 1) {
      const bracket = text.slice(1, end);
      const eq = bracket.indexOf("=");
      const name = (eq >= 0 ? bracket.slice(0, eq) : bracket).trim();
      const defaultValue = eq >= 0 ? bracket.slice(eq + 1).trim() : undefined;
      const description = text
        .slice(end + 1)
        .replace(/^\s*-\s*/, "")
        .trim();
      return {
        name: name || undefined,
        default: defaultValue || undefined,
        description: description || undefined,
        type,
      };
    }
  }

  const named = parseNamedTag(text);
  return {
    name: named?.name,
    description: named?.description,
    type,
  };
}

function parseTypedNamedTag(
  rawText: string,
): { name?: string; description?: string; type?: string } | undefined {
  const { type, rest } = readLeadingType(rawText);
  const named = parseNamedTag(rest);
  if (!named?.name) return undefined;
  return { name: named.name, description: named.description, type };
}

function parseSlotTag(rawText: string): { name: string; description?: string } | undefined {
  const text = rawText.trim();
  if (!text) return { name: "", description: undefined };

  if (text.startsWith("-")) {
    return { name: "", description: text.replace(/^-\s*/, "").trim() || undefined };
  }

  const parsed = parseNamedTag(text);
  if (!parsed?.name) return undefined;
  return { name: parsed.name, description: parsed.description };
}

function parseCssPropertyTag(
  rawText: string,
): { name: string; description?: string; default?: string } | undefined {
  const text = stripLeadingType(rawText);
  if (!text) return undefined;

  if (text.startsWith("[")) {
    const end = text.indexOf("]");
    if (end > 1) {
      const bracket = text.slice(1, end);
      const eq = bracket.indexOf("=");
      const tokenName = eq >= 0 ? bracket.slice(0, eq) : bracket;
      const defaultValue = eq >= 0 ? bracket.slice(eq + 1).trim() : undefined;
      const description = text
        .slice(end + 1)
        .replace(/^\s*-\s*/, "")
        .trim();
      const name = tokenName.trim();
      if (!name) return undefined;
      return {
        name,
        description: description || undefined,
        default: defaultValue || undefined,
      };
    }
  }

  const named = parseNamedTag(text);
  if (!named?.name) return undefined;
  return { name: named.name, description: named.description };
}

function parseEventTag(
  rawText: string,
): { name?: string; description?: string; type?: string } | undefined {
  const { type, rest } = readLeadingType(rawText);
  const named = parseNamedTag(rest);
  if (!named?.name) return undefined;
  return { name: named.name, description: named.description, type: type || undefined };
}

function parseOmitInheritedTags(
  tags: JSDocTagInfo[],
): ParsedJSDocClassInfo["omitInherited"] | undefined {
  const out: NonNullable<ParsedJSDocClassInfo["omitInherited"]> = {};

  const add = (key: keyof NonNullable<ParsedJSDocClassInfo["omitInherited"]>, rawText: string) => {
    const parsed = parseNamedTag(rawText);
    if (!parsed?.name) return;
    const bucket = (out[key] ??= []);
    if (!bucket.includes(parsed.name)) bucket.push(parsed.name);
  };

  for (const tag of tags) {
    if (tag.tagName === "omit") {
      add("members", tag.text);
      add("attributes", tag.text);
      continue;
    }
    if (tag.tagName === "omit-method") {
      add("members", tag.text);
      continue;
    }
    if (tag.tagName === "omit-attr" || tag.tagName === "omit-attribute") {
      add("attributes", tag.text);
      continue;
    }
    if (tag.tagName === "omit-cssprop" || tag.tagName === "omit-cssproperty") {
      add("cssProperties", tag.text);
      continue;
    }
    if (tag.tagName === "omit-part" || tag.tagName === "omit-csspart") {
      add("cssParts", tag.text);
      continue;
    }
    if (tag.tagName === "omit-cssState" || tag.tagName === "omit-cssstate") {
      add("cssStates", tag.text);
      continue;
    }
    if (tag.tagName === "omit-event") {
      add("events", tag.text);
      continue;
    }
    if (tag.tagName === "omit-slot") {
      add("slots", tag.text);
      continue;
    }
  }

  return Object.keys(out).length ? out : undefined;
}
