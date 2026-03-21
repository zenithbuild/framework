<template>
  <div class="site-shell">
    <header class="site-header">
      <strong>Nuxt Fixture</strong>
      <nav class="site-nav" aria-label="Primary">
        <a href="/">Home</a>
        <a href="/guides">Guides</a>
        <a href="/guides/getting-started">Getting started</a>
      </nav>
    </header>
    <main class="site-main">
      <slot />
    </main>
    <footer class="site-footer">Benchmark fixture footer.</footer>
  </div>
</template>
