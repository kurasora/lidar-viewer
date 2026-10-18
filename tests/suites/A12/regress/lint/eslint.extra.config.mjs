// A12: recommended に加えて、不具合を見つけやすい規則（書き方の好みではないもの）を足した点検
import base from './eslint.config.mjs';
export default [
  ...base,
  { rules: {
    'require-atomic-updates': ['warn', { allowProperties: false }],
    'no-unmodified-loop-condition': 'warn', 'no-unreachable-loop': 'warn', 'no-self-compare': 'warn',
    'no-template-curly-in-string': 'warn', 'array-callback-return': 'warn', 'no-promise-executor-return': 'warn',
    'no-constructor-return': 'warn', 'no-unused-private-class-members': 'warn', 'no-loop-func': 'warn',
    'no-sequences': 'warn', 'no-return-assign': 'warn', 'radix': 'warn', 'no-shadow': ['warn', { builtinGlobals: false, hoist: 'functions' }],
    'no-use-before-define': ['warn', { functions: false, classes: true, variables: true }],
    'eqeqeq': ['warn', 'smart'], 'no-eq-null': 'off', 'no-param-reassign': 'off', 'default-case-last': 'warn',
    'no-await-in-loop': 'off', 'consistent-return': 'off', 'no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],
  } },
];
