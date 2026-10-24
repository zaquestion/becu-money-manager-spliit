import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // The bridge posts to location.origin, so the page needs a real one.
    environmentOptions: { happyDOM: { url: 'https://widgets.moneydesktop.com/md/' } },
  },
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
});
