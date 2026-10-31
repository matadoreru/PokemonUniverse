import { configDefaults, defineConfig } from 'vitest/config';

// Vitest 5 ya no excluye dist/ por defecto: sin esto ejecutaría también los tests compilados.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '**/dist/**'] } });
