<script setup lang="ts">
useNowTicker();
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <header class="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-6 pb-2 flex items-center justify-between gap-4">
      <NuxtLink to="/" class="flex items-center gap-2 font-bold text-lg tracking-tight">
        <img src="/favicon.svg" alt="" width="26" height="26" />
        link-short
      </NuxtLink>
      <a class="text-sm text-muted hover:text-ink" href="https://github.com/MOlexiy/link-short">Source on GitHub</a>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 py-8">
      <NuxtPage />
    </main>

    <footer class="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 text-sm text-muted">
      Nuxt on Lambda, Node.js API on Lambda, MongoDB Atlas. Built by
      <a class="link" href="https://www.linkedin.com/in/mormulolexii">Olexii Mormul</a>.
    </footer>
  </div>
</template>
