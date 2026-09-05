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
            { label: "Plugin System", link: "/guide/plugins/" },
          ],
        },
        {
          label: "Plugins",
          items: [
            { label: "Overview", link: "/plugins/" },
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
