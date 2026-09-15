import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  base: "/cem-generator",
  integrations: [
    starlight({
      title: "CEM Generator",
      description: "Documentation for the wc-toolkit CEM generator monorepo.",
      sidebar: [
        {
          label: "Guide",
          items: [
            { label: "Overview", link: "/guide/overview/" },
            { label: "Documenting", link: "/guide/documenting/" },
            { label: "Configuration", link: "/guide/configuration/" },
            { label: "CLI", link: "/guide/cli/" },
            { label: "Bundler Plugin", link: "/guide/bundler/" },
          ],
        },
        {
          label: "Features",
          items: [
            { label: "Vanilla Detection", link: "/guide/features/vanilla-detection/" },
            { label: "JSDoc Tags", link: "/guide/features/jsdoc-tags/" },
            { label: "Sorting", link: "/guide/features/sorting/" },
            { label: "Type Parsing", link: "/guide/features/type-parsing/" },
            { label: "Inheritance", link: "/guide/features/inheritance/" },
            { label: "Module Paths", link: "/guide/features/module-paths/" },
            { label: "Generation Validation", link: "/guide/features/validation/" },
            { label: "CSS-Only Elements", link: "/guide/features/css-only-elements/" },
          ],
        },
        {
          label: "Plugins",
          items: [
            { label: "Overview", link: "/plugins/" },
            { label: "Creating Plugins", link: "/plugins/creating-plugins/" },
            { label: "Lit Plugin", link: "/plugins/lit/" },
            { label: "FAST Plugin", link: "/plugins/fast/" },
            { label: "Preact Plugin", link: "/plugins/preact/" },
            { label: "Vue Plugin", link: "/plugins/vue/" },
            { label: "Solid Plugin", link: "/plugins/solid/" },
            { label: "Svelte Plugin", link: "/plugins/svelte/" },
            { label: "Stencil Plugin", link: "/plugins/stencil/" },
          ],
        },
      ],
      social: {
        github: "https://github.com/wc-toolkit",
      },
    }),
  ],
});
