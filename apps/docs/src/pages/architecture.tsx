import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

export default function Architecture(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.tagline}
      description="Architecture overview of the catshark headless spatial-modelling engine."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Architecture</Heading>
        <p>
          Catshark is a headless engine: the core owns the data model and state,
          the React package maps that state into React, and the renderer-2d /
          renderer-3d packages plug into a renderer-agnostic Canvas host.
        </p>
        <ul>
          <li><b>@catshark/core</b> — headless <code>SimulationEngine</code>, registries, state slices, <code>CoordinateService</code>.</li>
          <li><b>@catshark/react</b> — <code>useEngine</code>, <code>useDraw</code>, <code>useModel</code>, <code>&lt;Canvas&gt;</code> host.</li>
          <li><b>@catshark/renderer-2d</b> — MapLibre + TerraDraw renderer implementing the <code>Renderer</code> port.</li>
          <li><b>@catshark/renderer-3d</b> — WebGL / WebGPU (stub).</li>
          <li><b>@catshark/client</b> — tile / upload / model-output fetchers.</li>
        </ul>
      </main>
    </Layout>
  );
}