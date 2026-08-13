import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dsh.pub',
  output: 'static',
  integrations: [sitemap()],
  build: {
    format: 'directory',
  },
});
