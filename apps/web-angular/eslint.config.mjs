import angular from 'angular-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import base from '../../eslint.config.base.js';

export default defineConfig(
  globalIgnores(['dist', '.angular']),
  {
    files: ['**/*.ts'],
    extends: [base, angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
);
