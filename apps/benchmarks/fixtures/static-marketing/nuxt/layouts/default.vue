<template>
  <div class="site-shell">
    <header class="site-header">
      <strong>Nuxt Fixture</strong>
      <nav class="site-nav" aria-label="Primary">
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
    </header>
    <main class="site-main">
      <slot />
    </main>
    <footer class="site-footer">Benchmark fixture footer.</footer>
  </div>
</template>
