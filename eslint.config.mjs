import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { 'no-restricted-imports': ['error', {
      paths: [{ name: '@pokemon-universe/shared', message: 'Use @pokemon-universe/shared/public in browser code.' }],
      patterns: [{ group: ['@pokemon-universe/shared/server', '**/shared/src/**', '**/server/src/**'], message: 'Authoritative server modules cannot be imported by the browser.' }],
    }] },
  },
);
