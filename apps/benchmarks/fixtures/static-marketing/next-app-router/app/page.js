export default function HomePage() {
  return (
    <>
      <section className="hero stack">
        <p data-benchmark-copy="lead">Static marketing benchmark fixture for Next App Router.</p>
        <h1>Compiler-first pages with no client state.</h1>
        <p>This case measures a static landing surface with multiple content sections and supporting routes.</p>
      </section>

      <section className="section stack">
        <h2>What it contains</h2>
        <div className="metric-grid">
          <article className="panel">
            <h3>Shared layout</h3>
            <p>One shell, one navigation block, and simple route links.</p>
          </article>
          <article className="panel">
            <h3>Static sections</h3>
            <p>Hero, positioning copy, and proof-oriented content without hydration logic.</p>
          </article>
          <article className="panel">
            <h3>Supporting routes</h3>
            <p>Additional about and contact pages so route output is not a single-file trivial case.</p>
          </article>
        </div>
      </section>

      <section className="section stack">
        <h2>Why this case exists</h2>
        <p>It establishes the low-interactivity baseline before list-driven or hydrated pages enter the comparison matrix.</p>
      </section>
    </>
  );
}
