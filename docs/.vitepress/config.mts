import { defineConfig } from "vitepress";

const repo = "https://github.com/utensils/latentforge";

export default defineConfig({
  lang: "en-US",
  title: "LatentForge",
  description:
    "Interactive CLI for building high-quality image datasets for Flux LoRA fine-tuning, powered by the Claude Agent SDK.",
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ["meta", { name: "theme-color", content: "#cc785c" }],
    ["meta", { property: "og:title", content: "LatentForge" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Chat with a Claude agent that searches, downloads, curates, deduplicates, resizes, and captions images — end-to-end, through natural conversation.",
      },
    ],
  ],

  themeConfig: {
    siteTitle: "LatentForge",

    nav: [
      { text: "Guide", link: "/guide/getting-started", activeMatch: "/guide/" },
      { text: "Reference", link: "/reference/tools", activeMatch: "/reference/" },
      { text: "GitHub", link: repo },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Architecture", link: "/guide/architecture" },
            { text: "Dataset Config", link: "/guide/configs" },
            { text: "Workflow", link: "/guide/workflow" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "MCP Tools", link: "/reference/tools" },
            { text: "Slash Commands", link: "/reference/slash-commands" },
            { text: "CLI", link: "/reference/cli" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: repo }],

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: `Copyright © ${new Date().getFullYear()} James Brink`,
    },

    outline: { level: [2, 3] },
  },
});
