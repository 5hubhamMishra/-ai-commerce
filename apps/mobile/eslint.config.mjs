// @ts-check
import eslint from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['.expo/**', 'coverage/**', 'dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        // Expo/React Native ambient globals not covered by the `globals` package.
        __DEV__: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React Native's JSX transform doesn't need React in scope
      'react/prop-types': 'off', // TypeScript covers this
      // Same call apps/api's config makes: TS already reports unresolved
      // identifiers with better information than this rule can.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '__mocks__/**'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },
  {
    // A plain CommonJS Node script (ADR-031's jest/npm-workspace-hoisting
    // fix, run via the `pretest` hook) — require() is the correct style
    // here, not TypeScript source subject to ESM linting.
    files: ['scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
