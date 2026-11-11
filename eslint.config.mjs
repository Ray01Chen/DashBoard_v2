import globals from 'globals';

const rules = {
  'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-dupe-args': 'error',
  'no-dupe-keys': 'error',
  'no-constant-condition': 'error',
};

export default [
  { ignores: ['.runtime/**', 'node_modules/**', 'data/**', 'docs/**'] },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: { globals: { ...globals.nodeBuiltin, ...globals.browser } },
    rules,
  },
  {
    files: ['*.mjs'],
    languageOptions: { globals: globals.nodeBuiltin },
    rules,
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.browser },
    rules,
  },
];
