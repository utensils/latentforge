import { defineConfig } from "vitepress";

const base = process.env.DOCS_BASE ?? "/latentforge/";

export default defineConfig({
  title: "LatentForge",
  description:
    "Interactive CLI for building image datasets for Flux LoRA fine-tuning, powered by the Claude Agent SDK.",
  base,
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: `${base}logo.svg` }],
    ["meta", { name: "theme-color", content: "#d97706" }],
  ],

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "LatentForge",

    nav: [
      { text: "Guide", link: "/guide/getting-started", activeMatch: "/guide/" },
      { text: "API", link: "/api/", activeMatch: "/api/" },
      {
        text: "v0.1",
        items: [
          { text: "Changelog", link: "https://github.com/utensils/latentforge/releases" },
          { text: "Contributing", link: "https://github.com/utensils/latentforge/blob/main/README.md" },
        ],
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Architecture", link: "/guide/architecture" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Dataset Config", link: "/guide/dataset-config" },
            { text: "Slash Commands", link: "/guide/slash-commands" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API",
          items: [
            { text: "Overview", link: "/api/" },
            { text: "Tools Reference", link: "/api/tools" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/utensils/latentforge" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2025 Utensils",
    },

    editLink: {
      pattern:
        "https://github.com/utensils/latentforge/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    search: {
      provider: "local",
    },

    outline: {
      level: [2, 3],
    },
  },
});
