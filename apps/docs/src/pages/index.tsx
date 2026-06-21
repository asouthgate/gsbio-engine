import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Catshark Engine — a headless spatial-modelling engine."
    >
      <main className="container margin-vert--xl text--center">
        <Heading as="h1">{siteConfig.title}</Heading>
        <p className="padding-vert--md">{siteConfig.tagline}</p>
        <div>
          <Link className="button button--primary button--lg" to="/docs/intro">
            <Translate>Read the docs</Translate>
          </Link>
          <span> </span>
          <Link className="button button--secondary button--lg" to="/architecture">
            View architecture
          </Link>
        </div>
      </main>
    </Layout>
  );
}