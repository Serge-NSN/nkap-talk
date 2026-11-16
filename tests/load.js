// Loads NkapTalk content scripts into a plain Node context (no DOM) for unit tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * `extras` adds globals to the sandbox, for scripts that reach for a browser API.
 * Pass a function that closes over a test variable if the answer has to change later:
 * the sandbox gets the same function object, so the closure still works.
 */
module.exports = function load(files, extras) {
  const ctx = { console, globalThis: null, setTimeout, clearTimeout, ...(extras || {}) };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'nkaptalk-extension', 'content', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx.NkapTalk;
};
