<script setup>
const categories = [
  { id: "all", label: "All" },
  { id: "compiler", label: "Compiler" },
  { id: "runtime", label: "Runtime" },
  { id: "tooling", label: "Tooling" },
];

const workflows = [
  { category: "compiler", title: "Lower expression graphs", body: "Compiler-focused workflow used to validate authored output." },
  { category: "compiler", title: "Audit marker emission", body: "Checks that generated binding markers remain deterministic." },
  { category: "runtime", title: "Validate hydration payloads", body: "Runtime workflow focused on activation cost and payload integrity." },
  { category: "runtime", title: "Inspect route boot", body: "Runtime workflow that keeps browser-side work observable." },
  { category: "tooling", title: "Boot local dev", body: "Tooling-focused workflow centered on development startup." },
  { category: "tooling", title: "Re-run targeted builds", body: "Tooling workflow used to reason about repeated local change cycles." },
];

const activeCategory = ref("all");
const visibleWorkflows = computed(() => workflows.filter((workflow) => activeCategory.value === "all" || workflow.category === activeCategory.value));

function cardClass(category) {
  return activeCategory.value === "all" || category === activeCategory.value ? "panel" : "panel card-hidden";
}
</script>

<template>
  <div>
    <section class="stack">
      <p data-benchmark-copy="lead">Interactive filter benchmark fixture for Nuxt.</p>
      <h1>Small interactive surface with equivalent category controls.</h1>
      <p>This case introduces real client state while staying narrow enough for fair framework comparison.</p>
    </section>

    <section class="section stack" id="filters">
      <div class="filters">
        <button
          v-for="category in categories"
          :key="category.id"
          class="filter-button"
          type="button"
          data-category-button
          :data-category="category.id"
          :data-active="activeCategory === category.id ? 'true' : 'false'"
          :aria-pressed="activeCategory === category.id"
          @click="activeCategory = category.id"
        >
          {{ category.label }}
        </button>
      </div>

      <p>Showing <span data-visible-count>{{ visibleWorkflows.length }}</span> workflows.</p>

      <div class="panel-grid">
        <article
          v-for="workflow in workflows"
          :key="workflow.title"
          :class="cardClass(workflow.category)"
        >
          <h2>{{ workflow.title }}</h2>
          <p>{{ workflow.body }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
