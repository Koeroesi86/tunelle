// typescript-eslint needs the TypeScript 6 API, and TypeScript 7 has none. See docs/development/typescript-eslint.md
const Module = require('module');
const load = Module._load;
Module._load = (request, ...rest) => load.call(Module, request === 'typescript' ? 'typescript6' : request, ...rest);

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');
const jsxA11y = require('eslint-plugin-jsx-a11y');

module.exports = [
  {
    ignores: ['**/dist/**', '**/build/**', '**/out/**', 'icons/**', '.idea/**', '.cache/**', 'coverage/**', 'electron/schemas/database/**', '**/node_modules/**', '**/*.js'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tsPlugin, prettier: prettierPlugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'max-depth': ['warn', 1],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'prettier/prettier': [
        'error',
        {
          semi: true,
          singleQuote: true,
          printWidth: 160,
          trailingComma: 'es5',
        },
        { usePrettierrc: false },
      ],
    },
  },
  {
    // accessibility rules for the renderer, as warnings until #317 is done. See docs/development/accessibility.md
    files: ['client/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: Object.fromEntries(Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, setting]) => [rule, ['warn', ...[setting].flat().slice(1)]])),
  },
  {
    // tests may cast to build partial fixtures; production code may not
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }] },
  },
];
