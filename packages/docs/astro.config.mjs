import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "CEM Generator",
      description: "Documentation for the wc-toolkit CEM generator monorepo.",
      sidebar: [
        {
          label: "Guide",
          items: [
            { label: "Overview", link: "/guide/overview/" },
            { label: "Configuration", link: "/guide/configuration/" },
            { label: "Documenting", link: "/guide/documenting/" },
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
            { label: "CLI", link: "/guide/features/cli/" },
          ],
        },
        {
          label: "Plugins",
          items: [
            { label: "Overview", link: "/plugins/" },
            { label: "Creating Plugins", link: "/plugins/creating-plugins/" },
            { label: "Lit Plugin", link: "/plugins/lit/" },
          ],
        },
      ],
      social: {
        github: "https://github.com/wc-toolkit",
      },
    }),
  ],
});
