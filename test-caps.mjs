import { execFileSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 2000 });
const capsOn = () => /Caps Lock:\s+on/.test(run('xset', ['q']));
const initialCaps = capsOn();
const focus = run('xdotool', ['getwindowfocus']).trim();
const env = run('systemctl', ['show', 'voxl-stream.service', '-p', 'Environment', '--value']);
const password = env.match(/(?:^|\s)VOXL_PASSWORD=([^\s"]+)/)?.[1];
assert.ok(password, 'Configured credential required');
const xev = spawn('stdbuf', ['-oL', 'xev', '-name', 'Voxl Caps Lock Test', '-event', 'keyboard'], { stdio: ['ignore', 'pipe', 'ignore'] });
let output = '';
xev.stdout.on('data', b => output += b.toString());
let ws;
try {
  await sleep(500);
  const id = run('xdotool', ['search', '--name', '^Voxl Caps Lock Test$']).trim().split('\n')[0];
  run('xdotool', ['windowfocus', '--sync', id]);
  if (capsOn()) run('xdotool', ['key', 'Caps_Lock']);
  ws = new WebSocket('ws://127.0.0.1:6901/ws?token=' + encodeURIComponent(password));
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const tap = async keysym => {
    ws.send(`k,${keysym},1`); ws.send(`k,${keysym},0`);
    await sleep(150);
  };
  const check = async (sym, expected) => {
    output = '';
    await tap(sym);
    const names = [...output.matchAll(/KeyPress event[^]*?keysym 0x[0-9a-f]+, ([^)]+)\)/g)].map(m => m[1]);
    assert.ok(names.includes(expected), `Expected ${expected}; got ${names.join(', ')}`);
    console.log(`PASS: Caps ${capsOn() ? 'ON' : 'OFF'}, keysym ${String.fromCodePoint(sym)} → ${expected}`);
  };
  await check(0x61, 'a');
  await check(0x41, 'A');
  await tap(0xffe5);
  assert.ok(capsOn(), 'Caps Lock key must toggle X11 lock state');
  await check(0x41, 'A');
  await check(0x61, 'a');
  await check(0x31, '1');
  await check(0x21, 'exclam');
  await tap(0xffe5);
  assert.ok(!capsOn(), 'Caps Lock key must toggle OFF');
  await check(0x61, 'a');
} finally {
  ws?.send('r'); ws?.close();
  if (capsOn() !== initialCaps) run('xdotool', ['key', 'Caps_Lock']);
  xev.kill();
  try { run('xdotool', ['windowfocus', focus]); } catch {}
}
