import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextCoreWebVitals,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'react/no-unescaped-entities': 'warn',
      // eslint-config-next 16 bundles eslint-plugin-react-hooks v7's React
      // Compiler-alignment rules at 'error'. This app doesn't use the React
      // Compiler; downgrading to 'warn' preserves the pre-upgrade lint gate
      // instead of forcing unrelated effect-pattern refactors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];

export default config;
