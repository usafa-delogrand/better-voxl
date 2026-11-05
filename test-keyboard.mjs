// Regression tests for browser-side keyboard forwarding (no browser required).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'voxl-keyboard-'));
try {
  const bundle = join(dir, 'keyboard.mjs');
  execFileSync('esbuild', ['web/src/client/keyboard.ts', '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`]);
  const { setupKeyboard } = await import(pathToFileURL(bundle));
  const kbd = new EventTarget();
  const surface = new EventTarget();
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  globalThis.HTMLElement = class {};
  const sent = [];
  setupKeyboard({ kbd, surface, send: msg => sent.push(msg), isMac: true, remoteMac: false, inIframe: true }, {}, () => {});
  function event(type, code, key, modifiers = {}) {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { code, key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
      repeat: false, isComposing: false, getModifierState: name => name === 'AltGraph' && !!modifiers.altGraph,
      ...modifiers });
    kbd.dispatchEvent(e);
    return e;
  }
  function check(code, key, modifiers, expected) {
    if (modifiers.altKey && !modifiers.altGraph) event('keydown', 'AltLeft', 'Alt', { altKey: true });
    sent.length = 0;
    const e = event('keydown', code, key, modifiers);
    event('keyup', code, key, modifiers);
    assert.deepEqual(sent, [`k,${expected},1`, `k,${expected},0`]);
    assert.equal(e.defaultPrevented, true);
    if (modifiers.altKey && !modifiers.altGraph) event('keyup', 'AltLeft', 'Alt');
  }
  for (const [i, key] of ['¡', '™', '£', '¢', '∞', '§', '¶', '•', 'ª', 'º'].entries()) {
    const n = (i + 1) % 10;
    check(`Digit${n}`, key, { altKey: true }, 48 + n);
    check(`Digit${n}`, key, { altKey: true, shiftKey: true }, 48 + n);
  }
  check('KeyQ', 'Œ', { altKey: true, shiftKey: true }, 0x71);
  check('Digit2', '@', { shiftKey: true }, 0x40);
  check('Digit2', '™', {}, 0x01002122);
  check('Digit2', '@', { altKey: true, altGraph: true }, 0x40);
  check('Digit2', '2', { metaKey: true }, 0x32);
  check('Digit2', '2', { ctrlKey: true }, 0x32);
  // Keyup must release the same digit even if Option has already been released.
  sent.length = 0;
  event('keydown', 'AltLeft', 'Alt', { altKey: true });
  event('keydown', 'Digit2', '™', { altKey: true });
  event('keyup', 'AltLeft', 'Alt');
  event('keyup', 'Digit2', '2');
  assert.deepEqual(sent, ['k,65513,1', 'k,50,1', 'k,65513,0', 'k,50,0']);
  sent.length = 0;
  event('keydown', 'Digit2', '™', { altKey: true });
  event('keyup', 'Digit2', '2', { altKey: false });
  assert.deepEqual(sent, ['k,65513,1', 'k,50,1', 'k,50,0', 'k,65513,0']);
  // Chord received on the document (e.g. a focused toolbar button).
  sent.length = 0;
  const chord = new Event('keydown', { cancelable: true });
  Object.assign(chord, { code: 'Digit3', key: '£', altKey: true, getModifierState: () => false });
  document.dispatchEvent(chord);
  assert.deepEqual(sent, ['k,65513,1', 'k,51,1']);
  window.dispatchEvent(new Event('blur'));
  console.log('PASS: missing Option-down recovery, document-level workspace capture; Option+0–9, Shift chords, letter shortcuts, AltGr, ordinary text, and release ordering');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
