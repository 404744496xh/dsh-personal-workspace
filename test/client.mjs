/**
 * Client-half smoke test. Loads client.js in a mock browser runtime and
 * invokes the module's factory + apply(), so a scope/reference error that
 * node --check cannot catch (e.g. calling wireLocale/tr out of scope) fails
 * the test instead of silently killing the whole UI registration in DSH.
 */
import assert from 'node:assert/strict';

const CLIENT = new URL('../client.js', import.meta.url).href;

let desc;
globalThis.window = { __ModuleLoader__: { load(d) { desc = d; } } };
// Node 24 exposes a read-only global navigator; redefine it for the browser shim.
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'zh-CN' }, configurable: true, writable: true,
});

await import(CLIENT);
assert.ok(desc, 'client.js did not register a module');
assert.equal(desc.id, '@local/dsh-personal-workspace');

const React = {
  createElement: () => ({}),
  useState: (v) => [v, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
};
const mod = desc.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});
assert.deepEqual(mod.inject, ['slots', 'locale']);

const registered = [];
const ctx = {
  get(name) {
    if (name === 'locale') return { register: () => () => {}, bind: () => (k) => k };
    return undefined;
  },
  slots: {
    inject(_name, fn) { fn(); return () => {}; },
    register(meta, comp) { registered.push({ meta, comp: typeof comp }); return () => {}; },
  },
  effect() {},
};

mod.apply(ctx); // would throw ReferenceError if scope were wrong
assert.ok(registered.some((r) => r.meta.name === 'sidebar.panellist'), 'no sidebar launcher registered');
assert.ok(registered.some((r) => r.meta.name === 'main'), 'no main panel registered');
assert.equal(registered.find((r) => r.meta.name === 'main').meta.key, 'dsh-personal-workspace');

console.log('CLIENT TEST PASSED: sidebar.panellist + main registered, apply() did not throw');
