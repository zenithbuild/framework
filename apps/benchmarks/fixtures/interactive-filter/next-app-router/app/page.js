import InteractiveFilter from "./InteractiveFilter";

export default function HomePage() {
  return (
    <>
      <section className="stack">
        <p data-benchmark-copy="lead">Interactive filter benchmark fixture for Next App Router.</p>
        <h1>Small interactive surface with equivalent category controls.</h1>
        <p>This case introduces real client state while staying narrow enough for fair framework comparison.</p>
      </section>

      <InteractiveFilter />
    </>
  );
}
