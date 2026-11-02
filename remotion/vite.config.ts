import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Builds one self-contained ES module (React + Remotion Player + all
// compositions) that the plain-JS slide deck imports from web/js/remotion/.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: fileURLToPath(new URL('../web/js/remotion', import.meta.url)),
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./src/index.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'bundle.js'
    },
    sourcemap: false,
    minify: true,
    // lib mode keeps whitespace by default; this is a leaf bundle, so squeeze it fully
    rolldownOptions: { output: { minify: true } },
    target: 'es2022'
  }
});
