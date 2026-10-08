import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/generated/**', 'api/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // shared/ must stay free of anything that only exists in one platform (ADR / CLAUDE.md 1.1).
    files: ['shared/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'sessionStorage',
        'navigator',
        'location',
        'indexedDB',
        'process',
        'Buffer',
      ],
    },
  },
);
