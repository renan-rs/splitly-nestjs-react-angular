import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import base from '../../eslint.config.base.js';

export default defineConfig(
  globalIgnores(['dist', 'coverage', 'src/generated']),
  base,
  { languageOptions: { globals: globals.node } },
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
);
