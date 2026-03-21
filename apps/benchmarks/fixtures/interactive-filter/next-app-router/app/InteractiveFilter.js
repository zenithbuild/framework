"use client";

import { useState } from "react";

const workflows = [
  { category: "compiler", title: "Lower expression graphs", body: "Compiler-focused workflow used to validate authored output." },
  { category: "compiler", title: "Audit marker emission", body: "Checks that generated binding markers remain deterministic." },
  { category: "runtime", title: "Validate hydration payloads", body: "Runtime workflow focused on activation cost and payload integrity." },
  { category: "runtime", title: "Inspect route boot", body: "Runtime workflow that keeps browser-side work observable." },
  { category: "tooling", title: "Boot local dev", body: "Tooling-focused workflow centered on development startup." },
  { category: "tooling", title: "Re-run targeted builds", body: "Tooling workflow used to reason about repeated local change cycles." },
];

const categories = [
  { id: "all", label: "All" },
  { id: "compiler", label: "Compiler" },
  { id: "runtime", label: "Runtime" },
  { id: "tooling", label: "Tooling" },
];

export default function InteractiveFilter() {
  const [activeCategory, setActiveCategory] = useState("all");
  const visibleWorkflows = workflows.filter((workflow) => activeCategory === "all" || workflow.category === activeCategory);

  return (
    <section className="section stack" id="filters">
      <div className="filters">
        {categories.map((category) => (
          <button
            key={category.id}
            className="filter-button"
            type="button"
            data-category-button
            data-category={category.id}
            data-active={activeCategory === category.id ? "true" : "false"}
            aria-pressed={activeCategory === category.id}
            onClick={() => setActiveCategory(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>

      <p>Showing <span data-visible-count>{visibleWorkflows.length}</span> workflows.</p>

      <div className="panel-grid">
        {workflows.map((workflow) => (
          <article
            key={workflow.title}
            className={`panel ${activeCategory === "all" || workflow.category === activeCategory ? "" : "card-hidden"}`.trim()}
          >
            <h2>{workflow.title}</h2>
            <p>{workflow.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
