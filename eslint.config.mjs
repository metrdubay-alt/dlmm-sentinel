import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
export default ts.config({ ignores: ['dist/**', 'release/**', 'node_modules/**', 'src/generated/**'] }, js.configs.recommended, ...ts.configs.recommended, { languageOptions: { globals: { ...globals.node, ...globals.browser } } });
