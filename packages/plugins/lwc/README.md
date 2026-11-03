# @wc-toolkit/cem-generator-lwc

Lightning Web Components (LWC) detector plugin for generating Custom Elements Manifests.

## Detects

- classes extending `LightningElement`, directly or through a local base class
- component tag names from bundle folders, such as `c-greeting-card` for `greetingCard/greetingCard.js`
- `@api` properties, accessors, and methods as public members
- `@api` properties as kebab-case attributes, such as `recipientName` → `recipient-name`
- `new CustomEvent("name", ...)` dispatches inside the component as events
- `<slot>` and `<slot name="...">` elements in the bundle's sibling `.html` template
- standard members, JSDoc metadata, and types through the core generator

LWC internals such as `@track` fields, `@wire` members, private fields, and
undecorated methods are not part of the public API and are excluded from the
member list. Lifecycle hooks such as `connectedCallback` and `render` are
excluded for the same reason.

## Component naming

LWC derives a component's tag from its bundle folder and namespace. Tags are
produced only for the default export of a file whose name matches its folder
(`greetingCard/greetingCard.js`). Other classes, such as shared base classes,
are documented without a tag and with `customElement: false`.

The default namespace is `c`. Set `namespace` if your project uses another
namespace:

```ts
lwcPlugin({ namespace: "acme" }); // acme-greeting-card
```

## Usage

```ts
import { generateCem } from "@wc-toolkit/cem-generator";
import { lwcPlugin } from "@wc-toolkit/cem-generator-lwc";

const manifest = generateCem({
  plugins: [lwcPlugin()],
});
```

Run the included demo with `pnpm demo:lwc`. It writes the generated manifest to `demo/custom-elements.json`.
