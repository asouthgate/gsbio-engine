import type { SidebarsConfig } from '@docusaurus/types';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting started',
      items: ['intro'],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture',
        'architecture/core',
        'architecture/react',
        'architecture/react-ui',
        'architecture/renderers',
        'architecture/client',
        'architecture/data-flow',
        'architecture/conventions',
      ],
    },
  ],
};

export default sidebars;