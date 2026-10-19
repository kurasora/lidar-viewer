// A12: LiDAR Viewer のソースを eslint の recommended で点検する設定（元のプロジェクトは読むだけ）
import js from '@eslint/js';
import globals from 'globals';
const P = '/home/claude/pcd-viewer';
const defines = { __WORKER_CODE__: 'readonly', __WORKER_GZ__: 'readonly', __ARTIFACT__: 'readonly', __SAMPLE__: 'readonly', __SAMPLE_FILES__: 'readonly', __EMBED_ASSETS__: 'readonly' };
export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/dist-artifact/**', '**/release/**', '**/src/io/vendor/**'] },
  js.configs.recommended,
  { files: [`main.js`, `preload.js`], languageOptions: { sourceType: 'commonjs', ecmaVersion: 2023, globals: { ...globals.node } } },
  { files: [`build.mjs`], languageOptions: { sourceType: 'module', ecmaVersion: 2023, globals: { ...globals.node } } },
  { files: [`src/**/*.js`], languageOptions: { sourceType: 'module', ecmaVersion: 2023, globals: { ...globals.browser, ...globals.worker, ...defines } } },
  { rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-empty': ['warn', { allowEmptyCatch: true }] } },
];
