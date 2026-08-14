import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dsh.pub',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => !['/', '/404/'].includes(new URL(page).pathname),
      i18n: {
        defaultLocale: 'en',
        locales: {
          en: 'en',
          zh: 'zh-CN',
        },
      },
    }),
  ],
  build: {
    format: 'directory',
  },
});
