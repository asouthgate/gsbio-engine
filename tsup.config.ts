import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/remote/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
    };
  },
});
