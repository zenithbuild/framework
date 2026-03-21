export default function HomePage() {
  return (
    <>
      <section className="stack">
        <p data-benchmark-copy="lead">Content index benchmark fixture for Next App Router.</p>
        <h1>Repeated content surfaces with separate detail pages.</h1>
        <p>This case adds a small route tree of content pages without client interactivity.</p>
      </section>

      <section className="section stack">
        <h2>Included content routes</h2>
        <div className="panel-list">
          <article className="panel">
            <h3>Getting started</h3>
            <p>Introductory documentation route.</p>
            <a href="/guides/getting-started">Open guide</a>
          </article>
          <article className="panel">
            <h3>Compiler pipeline</h3>
            <p>Structured explanation route.</p>
            <a href="/guides/compiler-pipeline">Open guide</a>
          </article>
          <article className="panel">
            <h3>Runtime contracts</h3>
            <p>Reference-style detail route.</p>
            <a href="/guides/runtime-contracts">Open guide</a>
          </article>
        </div>
      </section>
    </>
  );
}
