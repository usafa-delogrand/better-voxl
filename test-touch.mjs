import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = mkdtempSync(join(tmpdir(), 'voxl-touch-'));
const realTimeout = globalThis.setTimeout, realClear = globalThis.clearTimeout;
const realRaf = globalThis.requestAnimationFrame, realCancel = globalThis.cancelAnimationFrame;
try {
  const bundle = join(dir, 'touch.mjs');
  execFileSync('esbuild', ['web/src/client/touch.ts', '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`]);
  const { createTouch } = await import(pathToFileURL(bundle));
  let timer;
  globalThis.setTimeout = fn => (timer = fn, 1);
  globalThis.clearTimeout = () => { timer = undefined; };
  let trackpad = true, dragging = false, holdArrows = false;
  const sent = [], moves = [], scrolls = [];
  const touch = createTouch({ surface: { setPointerCapture() {} }, send: s => sent.push(s) }, {
    moveTo: (x,y) => moves.push(['absolute',x,y]), moveBy: (x,y) => moves.push(['relative',x,y]),
    queueScroll: (x,y) => scrolls.push([x,y]), deskPerPx: () => 2,
    isTrackpad: () => trackpad, isDragging: () => dragging, holdArrows: () => holdArrows,
  });
  let eventTime = 0;
  const p = (id,x,y,time = eventTime += 100) => ({ pointerId:id, clientX:x, clientY:y, timeStamp: time });
  const reset = () => { touch.reset(); sent.length=moves.length=scrolls.length=0; };
  touch.down(p(1,20,20)); touch.move(p(1,60,30)); touch.up(p(1,60,30));
  assert.deepEqual(moves,[['relative',40,10]]); assert.deepEqual(sent,[]);
  reset(); touch.down(p(1,20,20)); touch.up(p(1,20,20));
  assert.deepEqual(sent,['b,1,1','b,1,0']); assert.deepEqual(moves,[]);
  reset(); touch.down(p(1,20,20)); timer(); touch.move(p(1,60,30)); touch.up(p(1,60,30));
  assert.deepEqual(sent,['b,1,1','b,1,0']); assert.deepEqual(moves,[['relative',40,10]]);
  reset(); touch.down(p(1,20,20)); touch.down(p(2,40,20)); touch.up(p(1,20,20)); touch.up(p(2,40,20));
  assert.deepEqual(sent,['b,3,1','b,3,0']);
  reset(); touch.down(p(1,20,20)); touch.down(p(2,40,20)); touch.move(p(1,20,60)); touch.up(p(1,20,60)); touch.up(p(2,40,20));
  assert.equal(scrolls.length,1); assert.deepEqual(scrolls[0],[0,-90], 'slow touch scrolling keeps precise base gain'); assert.deepEqual(sent,[]);
  reset(); touch.down(p(1,20,20)); timer(); touch.cancel(p(1,20,20));
  assert.deepEqual(sent,['b,1,1','b,1,0']);
  reset(); touch.down(p(1,20,20)); touch.cancel(p(1,20,20)); touch.up(p(1,20,20));
  assert.deepEqual(sent,[]);
  reset(); dragging=true; touch.down(p(1,20,20)); touch.move(p(1,60,30)); touch.up(p(1,60,30));
  assert.deepEqual(moves,[['relative',40,10]]); assert.deepEqual(sent,[]); dragging=false;
  reset(); trackpad=false; touch.down(p(1,20,20)); touch.up(p(1,20,20));
  assert.deepEqual(moves,[['absolute',20,20]]); assert.deepEqual(sent,['b,1,1','b,1,0']);
  reset(); touch.down(p(1,20,20)); touch.move(p(1,60,30)); touch.up(p(1,60,30));
  assert.deepEqual(sent,['b,1,1','b,1,0']); assert.deepEqual(moves,[['absolute',20,20],['absolute',60,30]]);
  reset(); touch.down(p(1,20,20)); timer(); touch.up(p(1,20,20));
  assert.deepEqual(sent,['b,3,1','b,3,0']);
  reset();trackpad=true;holdArrows=true;touch.down(p(1,20,20));timer();touch.move(p(1,52,4));touch.up(p(1,52,4));
  assert.deepEqual(moves,[]);assert.deepEqual(sent,['k,65363,1','k,65363,0','k,65363,1','k,65363,0','k,65362,1','k,65362,0']);
  reset();touch.down(p(1,20,20));timer();touch.cancel(p(1,20,20));touch.move(p(1,100,20));touch.up(p(1,100,20));assert.deepEqual(sent,[]);
  reset();touch.down(p(1,20,20));timer();touch.down(p(2,40,20));touch.move(p(1,20,60));touch.up(p(1,20,60));touch.up(p(2,40,20));assert.deepEqual(scrolls,[[0,-90]]);assert.deepEqual(sent,[]);
  reset();trackpad=false;touch.down(p(1,20,20));touch.down(p(2,40,20));touch.up(p(1,20,20));touch.up(p(2,40,20));assert.deepEqual(sent,['b,3,1','b,3,0'],'two-finger right-click works in Direct mode too');
  const frames=new Map();let frameId=0;globalThis.requestAnimationFrame=f=>{frames.set(++frameId,f);return frameId};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  reset();trackpad=true;holdArrows=false;touch.down(p(1,20,20,1000));touch.down(p(2,40,20,1005));touch.move(p(1,20,100,1025));touch.up(p(1,20,100,1028));assert.equal(frames.size,0,'no momentum while one finger is still down');touch.up(p(2,40,20,1030));assert.equal(frames.size,1,'lifting both fingers starts fling');
  const stale=[...frames.values()][0],scrollCount=scrolls.length;touch.down(p(1,20,20,1040));assert.equal(frames.size,0);touch.up(p(1,20,20,1060));stale(performance.now()+16);assert.equal(scrolls.length,scrollCount);assert.deepEqual(sent,[],'touch to stop momentum must not accidentally click');
  touch.down(p(1,20,20,1070));touch.up(p(1,20,20,1100));assert.deepEqual(sent,['b,1,1','b,1,0'],'a subsequent normal tap still clicks');
  console.log('PASS: accelerated two-finger scroll, fling on final lift, safe tap-to-stop, direct-mode right click, hold-swipe arrows, cancellation, latched drag and direct touch');
} finally {
  globalThis.setTimeout=realTimeout; globalThis.clearTimeout=realClear;
  globalThis.requestAnimationFrame=realRaf;globalThis.cancelAnimationFrame=realCancel;
  rmSync(dir,{recursive:true,force:true});
}
