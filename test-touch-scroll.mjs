import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'voxl-scroll-'));
try{
 const file=join(dir,'scroll.mjs');execFileSync('esbuild',['web/src/client/touch-scroll.ts','--bundle','--platform=node','--format=esm',`--outfile=${file}`]);
 const {createTouchScroll,scrollAcceleration}=await import(pathToFileURL(file));
 function harness(){
  let now=0,id=0;const pending=new Map(),sent=[];
  const clock={now:()=>now,request:f=>{pending.set(++id,f);return id},cancel:i=>pending.delete(i)};
  const scroll=createTouchScroll({emit:(x,y)=>sent.push([x,y]),scale:()=>3},clock);
  return{scroll,sent,pending,begin:(p,t)=>{now=t;scroll.begin(p,t)},move:(p,t)=>{now=t;scroll.move(p,t)},end:t=>{now=t;scroll.end(t)},step:dt=>{now+=dt;const callbacks=[...pending.values()];pending.clear();for(const f of callbacks)f(now)}};
 }
 assert.equal(scrollAcceleration(.1),1);assert.equal(scrollAcceleration(.25),1);
 assert.ok(scrollAcceleration(.8)>1&&scrollAcceleration(.8)<scrollAcceleration(1.5));assert.equal(scrollAcceleration(100),3.8);
 const slow=harness();slow.begin([0,0],0);slow.move([0,20],200);slow.end(200);assert.deepEqual(slow.sent,[[0,-60]]);assert.equal(slow.pending.size,0,'precision scroll does not fling');
 const fast=harness();fast.begin([0,0],0);fast.move([0,20],20);assert.ok(Math.abs(fast.sent[0][1])>Math.abs(slow.sent[0][1])*2,'same distance scrolls faster with a fast swipe');fast.end(22);assert.equal(fast.pending.size,1);
 const count=fast.sent.length;for(let i=0;i<100&&fast.pending.size;i++)fast.step(1000/60);assert.ok(fast.sent.length>count);assert.equal(fast.pending.size,0);assert.ok(fast.sent.every(([x,y])=>x===0&&y<0),'coast direction remains consistent');
 const paused=harness();paused.begin([0,0],0);paused.move([0,40],20);paused.end(220);assert.equal(paused.pending.size,0,'rest before release cancels stale velocity');
 const cancel=harness();cancel.begin([0,0],0);cancel.move([0,50],20);cancel.end(22);const stale=[...cancel.pending.values()][0],before=cancel.sent.length;cancel.scroll.cancel();assert.equal(cancel.pending.size,0);stale(100);assert.equal(cancel.sent.length,before,'even an already queued callback cannot scroll after cancellation');
 const reverse=harness();reverse.begin([0,0],0);reverse.move([0,50],20);reverse.move([0,20],40);reverse.end(42);const index=reverse.sent.length;reverse.step(16);assert.ok(reverse.sent[index][1]>0,'reversing the fingers reverses the fling');
 function coast(hz){const h=harness();h.begin([0,0],0);h.move([0,100],30);h.end(32);for(let i=0;i<hz*2&&h.pending.size;i++)h.step(1000/hz);assert.equal(h.pending.size,0);return-h.sent.reduce((s,p)=>s+p[1],0)}
 const distance=coast(60);for(const hz of [30,120])assert.ok(Math.abs(coast(hz)-distance)/distance<.02,'momentum is refresh-rate independent');
 assert.ok(distance<4000,'even a fast flick has a bounded tail');
 console.log('PASS: slow precision, velocity acceleration, bounded momentum, pause-to-stop, immediate cancellation, direction reversal, 30/60/120Hz consistency');
}finally{rmSync(dir,{recursive:true,force:true});}
