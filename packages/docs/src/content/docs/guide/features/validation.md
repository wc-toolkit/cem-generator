---
title: Generation Validation
description: Validate generated Custom Elements Manifest data and public type exports during generation.
---

The generator validates the completed manifest before `generateCem()` returns it.
This validation also runs for the bundler integrations, so an error prevents an
invalid manifest from being written.

## Configuration

Validation is configured with the `validation` option:

```ts
import { generateCem } from "@wc-toolkit/cem-generator";

const manifest = generateCem({
  validation: {
    invariants: "error",
    exportTypes: "error",
  },
});
```

Each rule accepts one of three severity levels:

| Severity | Behavior |
|----------|----------|
| `"off"` | Do not run the rule. |
| `"warning"` | Report failures through `onWarning`, but return the manifest. |
| `"error"` | Throw `ManifestValidationError` and stop generation. |

The defaults are:

| Rule | Default |
|------|---------|
| `invariants` | `"error"` |
| `exportTypes` | `"off"` |

Exported-type validation is opt-in because a component can intentionally use a
type supplied by another package. Enable it once the package's public type
export policy is established.

## Generated Manifest Invariants

The `invariants` rule checks the public CEM produced by the generator:

- The manifest uses the generator's target schema version.
- Every generated module has a non-empty `path`.
- Every export has a declaration reference with a module and declaration name.
- Every export declaration reference points to a generated declaration.
- A `custom-element-definition` export name matches its declaration's `tagName`.

These checks run after detector plugins, inheritance materialization,
annotators, module path resolution, sorting, and generated definition modules.
They therefore validate the same object that will be returned or written to
`custom-elements.json`.

Disable the checks only when producing an intentionally partial intermediate
manifest:

```ts
generateCem({
  validation: {
    invariants: "off",
  },
});
```

## Exported-Type Validation

The `exportTypes` rule uses the TypeScript program already created for the
generation run. It examines types used by public component metadata:

- fields and attributes;
- method parameters;
- method return types;
- event types and event details.

It reports local named types that are referenced by a component but are not
exported from that source module:

```ts
/** A state type kept private to the component module. */
type InternalState = "idle" | "busy";

/** A button exposing its current action state. @tag action-button */
export class ActionButton extends HTMLElement {
  /** The button's current interaction state. @attribute */
  state!: InternalState;
}
```

With `exportTypes: "error"`, generation fails because `InternalState` is part
of the public component API but is not exported. Export the type to make the
API consumable:

```ts
/** States that consumers may assign to an action button. */
export type ButtonState = "idle" | "busy";

/** A button exposing an exported state type. @tag action-button */
export class ActionButton extends HTMLElement {
  /** The button's current interaction state. @attribute */
  state!: ButtonState;
}
```

TypeScript standard-library and DOM types are excluded. Imported types are
accepted when their declarations are exported by their defining module.

## Warnings and Custom Reporting

Warnings do not stop generation. Use `onWarning` to integrate validation with
an existing logger or build reporter:

```ts
generateCem({
  validation: {
    exportTypes: "warning",
    onWarning(message) {
      buildLogger.warn(message);
    },
  },
});
```

Without `onWarning`, warnings are sent to `console.warn`.

Errors throw `ManifestValidationError`. The error exposes the structured
failures through its `failures` property:

```ts
import {
  ManifestValidationError,
  generateCem,
} from "@wc-toolkit/cem-generator";

try {
  generateCem({
    validation: { exportTypes: "error" },
  });
} catch (error) {
  if (error instanceof ManifestValidationError) {
    for (const failure of error.failures) {
      console.error(failure.rule, failure.message);
    }
  }
  throw error;
}
```

## CLI

Invariant validation is enabled during normal generation. Enable exported-type
validation with:

```bash
cem generate --validate-exported-types error
cem generate --validate-exported-types warning
```

The flag is equivalent to:

```ts
validation: {
  exportTypes: "error",
}
```

The accepted values are `off`, `warning`, and `error`.

Override the default invariant severity with:

```bash
cem generate --validation-invariants warning
cem generate --validation-invariants off
```

The accepted values are `off`, `warning`, and `error`.

The same setting can be kept in a project config file:

```ts
// cem-generator.config.ts
import type { RunOptions } from "@wc-toolkit/cem-generator";

export default {
  validation: {
    invariants: "error",
    exportTypes: "error",
  },
} satisfies RunOptions;
```

CLI validation settings are merged with config-file settings, with CLI values
taking precedence.
