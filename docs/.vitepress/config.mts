import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'LatentForge',
  description:
    'Interactive image dataset collection and curation tool for LoRA training, powered by the Claude Agent SDK.',
  cleanUrls: true,
  lastUpdated: true,
  lang: 'en-US',

  head: [
    ['meta', { name: 'theme-color', content: '#cc785c' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'LatentForge — LoRA dataset agent' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Chat with a Claude agent to search, curate, and export image datasets for Flux LoRA fine-tuning.',
      },
    ],
  ],

  themeConfig: {
    siteTitle: 'LatentForge',

    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'Tools', link: '/tools/reference', activeMatch: '/tools/' },
      {
        text: 'v0.1.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/utensils/latentforge/releases' },
          { text: 'Issues', link: 'https://github.com/utensils/latentforge/issues' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Dataset Configuration', link: '/guide/configuration' },
            { text: 'End-to-end Workflow', link: '/guide/workflow' },
          ],
        },
        {
          text: 'Reference',
          items: [{ text: 'MCP Tools', link: '/tools/reference' }],
        },
      ],
      '/tools/': [
        {
          text: 'Reference',
          items: [{ text: 'MCP Tools', link: '/tools/reference' }],
        },
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Dataset Configuration', link: '/guide/configuration' },
            { text: 'End-to-end Workflow', link: '/guide/workflow' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/utensils/latentforge' },
    ],

    search: { provider: 'local' },

    editLink: {
      pattern: 'https://github.com/utensils/latentforge/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Powered by the Claude Agent SDK.',
    },

    outline: { level: [2, 3], label: 'On this page' },
  },
})
