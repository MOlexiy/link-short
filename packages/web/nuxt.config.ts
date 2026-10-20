import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  devtools: { enabled: false },

  css: ["~/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    public: {
      // Overridden at runtime by NUXT_PUBLIC_API_URL (set by sst.config.ts).
      apiUrl: "http://localhost:4000",
    },
  },

  nitro: {
    // SST deploys the server bundle as a Lambda behind CloudFront.
    preset: process.env.NITRO_PRESET || "aws-lambda",
    serveStatic: true,
  },

  app: {
    head: {
      title: "link-short",
      htmlAttrs: { lang: "en" },
      meta: [
        { name: "description", content: "Short links with click analytics." },
        { name: "theme-color", content: "#2f5bea" },
      ],
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap",
        },
      ],
    },
  },

  typescript: { strict: true },
});
