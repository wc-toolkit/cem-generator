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
            { label: "Architecture", link: "/guide/architecture/" },
            { label: "Pipeline", link: "/guide/pipeline/" },
            { label: "Inheritance", link: "/guide/inheritance/" },
          ],
        },
        {
          label: "Features",
          items: [
            { label: "Vanilla Detection", link: "/guide/features/vanilla-detection/" },
            { label: "Alphabetical Sorting", link: "/guide/features/sorting/" },
            { label: "Type Parsing", link: "/guide/features/type-parsing/" },
            { label: "Inheritance", link: "/guide/features/inheritance/" },
            { label: "Conflict Policy", link: "/guide/features/conflict-policy/" },
            { label: "File Filtering", link: "/guide/features/file-filtering/" },
            { label: "Plugins", link: "/guide/features/plugins/" },
            { label: "CLI", link: "/guide/features/cli/" },
            { label: "Options Reference", link: "/guide/features/options/" },
            { label: "Output Schema", link: "/guide/features/output-schema/" },
            { label: "Performance", link: "/guide/features/performance/" },
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
        {
          label: "Reference",
          items: [
            { label: "Core API", link: "/reference/core-api/" },
            { label: "Core Utils API", link: "/reference/core-utils-api/" },
          ],
        },
        {
          label: "Contributing",
          items: [{ label: "Development", link: "/contributing/development/" }],
        },
      ],
      social: {
        github: "https://github.com/wc-toolkit",
      },
    }),
  ],
});
