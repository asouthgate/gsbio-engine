import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';

const config: Config = {
  title: 'Catshark Engine',
  tagline: 'A headless engine for biological spatial modelling on maps (or other manifolds).',
  favicon: 'img/favicon.svg',

  url: 'https://catshark-engine.dev',
  baseUrl: '/',

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.cts',
          editUrl: 'https://github.com/anomalyco/catshark-engine/tree/main/apps/docs/',
        },
        theme: { customCss: './src/css/custom.css' },
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Catshark Engine',
      items: [
        { type: 'doc', docId: 'intro', position: 'left', label: 'Docs' },
        { to: '/docs/architecture', label: 'Architecture', position: 'left' },
        { href: 'https://github.com/anomalyco/catshark-engine', label: 'GitHub', position: 'right' },
      ],
    },
    prism: { theme: prismThemes.vsDark, darkTheme: prismThemes.vsDark },
  },
};

export default config;