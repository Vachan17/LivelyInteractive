import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        labScene: resolve(__dirname, 'lab-scene.html'),
        journey: resolve(__dirname, 'journey.html'),
        ocean: resolve(__dirname, 'ocean.html'),
        contact: resolve(__dirname, 'contact.html'),
        privacy: resolve(__dirname, 'privacy.html'),
      },
    },
  },
});
