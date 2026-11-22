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
      'max-depth': ['error', 1],
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
    // accessibility rules for the renderer. See docs/development/accessibility.md
    files: ['client/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      ...Object.fromEntries(Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, setting]) => [rule, ['error', ...[setting].flat().slice(1)]])),
      // label-has-associated-control (recommended) accepts a label that wraps its control; label-has-for wants a wrapped control and an id, and is deprecated for it
      'jsx-a11y/label-has-for': 'off',
      // a field of our own that takes the focus when it opens, after a person asked for it (a new name, a rename); the DOM elements stay checked
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
    },
  },
  {
    // components take props; react-redux is used in client/containers only. See docs/development/containers.md
    files: ['client/components/**/*.ts', 'client/components/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { 'no-restricted-imports': ['error', { paths: [{ name: 'react-redux', message: 'Read the store in client/containers and pass props.' }] }] },
  },
  {
    // a component takes what is connected as props or slots, the containers give it. See docs/development/containers.md
    files: ['client/components/**/*.ts', 'client/components/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'react-redux', message: 'Read the store in client/containers and pass props.' }],
          patterns: [
            { group: ['**/containers/**'], message: 'A view takes a slot (a render prop or a node) that a container fills.' },
            { group: ['**/services/**', '**/backend/**'], message: 'The backend is reached in client/containers, which pass the function as a prop.' },
            { group: ['**/redux/**'], message: 'The store is read in client/containers; the types and helpers a view needs are in client/domain.' },
          ],
        },
      ],
    },
  },
  {
    // what a component imports (hooks, domain, utils) stays free of the store and the backend, so the components are free of them too. See docs/development/containers.md
    files: ['client/hooks/**/*.ts', 'client/hooks/**/*.tsx', 'client/domain/**/*.ts', 'client/utils/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'react-redux', message: 'Read the store in client/containers and pass props.' }],
          patterns: [
            { group: ['**/containers/**'], message: 'Containers use hooks and domain, not the other way round.' },
            { group: ['**/services/**', '**/backend/**'], message: 'A hook takes the function that reaches the backend as an argument; a container passes it.' },
            { group: ['**/redux/**'], message: 'The types and helpers of the store that a view needs are in client/domain.' },
          ],
        },
      ],
    },
  },
  {
    // a component is tested with props, not with the store or the backend; a connected one is tested in client/containers. See docs/development/containers.md
    files: ['client/components/**/*.test.ts', 'client/components/**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'react-redux', message: 'Test the connected component in client/containers.' }],
          patterns: [
            { group: ['**/containers/**', '**/services/**', '**/backend/**', '**/redux/**'], message: 'Pass a stub as a prop, or move the test to client/containers.' },
          ],
        },
      ],
    },
  },
  {
    // tests may cast to build partial fixtures; production code may not
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'electron/test-*.ts'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }] },
  },
];
