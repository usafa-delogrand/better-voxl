import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'voxl-background-'));
try {
 const bundle=join(dir,'pointer.mjs');execFileSync('esbuild',['web/src/client/pointer.ts','--bundle','--platform=node','--format=esm',`--outfile=${bundle}`]);
 const {setupPointer}=await import(pathToFileURL(bundle));
 const captures=[];
 class Element extends EventTarget {
  constructor(id=''){super();this.id=id;this.style={setProperty(){}};this.classList={toggle(){},add(){},remove(){}};}
  setAttribute(){} appendChild(){} focus(){} setPointerCapture(id){captures.push([this.id,id]);} releasePointerCapture(){}
  getBoundingClientRect(){return {left:0,top:100,width:400,height:225};}
 }
 const elements={};globalThis.document=new EventTarget();document.getElementById=id=>elements[id]||=(new Element(id));document.createElement=()=>new Element();
 globalThis.window=new EventTarget();window.innerWidth=390;window.innerHeight=844;globalThis.matchMedia=()=>({matches:true});
 globalThis.localStorage={getItem:key=>key==='voxl-touch-mode'?'direct':key==='voxl-precision'?'fast':null,setItem(){}};
 const frames=[];globalThis.requestAnimationFrame=fn=>(frames.push(fn),frames.length);globalThis.cancelAnimationFrame=()=>{};
 const surface=document.getElementById('surface'),background=document.getElementById('trackpad-space'),sent=[];
 setupPointer({surface,kbd:new Element(),send:s=>sent.push(s),desk:{w:1920,h:1080},view:{zoom:1}},()=>{});
 function p(target,type,x,y,id=1,pointerType='touch',button=0){const e=new Event(type,{cancelable:true});Object.assign(e,{clientX:x,clientY:y,pointerId:id,pointerType,button,buttons:type==='pointerup'?0:1});target.dispatchEvent(e);}
 p(background,'pointerdown',100,20);p(background,'pointermove',140,30);p(background,'pointerup',140,30);
 assert.deepEqual(captures.at(-1),['trackpad-space',1]);assert.ok(sent.includes('m,1114,578'));assert.ok(!sent.some(s=>s.startsWith('b,')),'blank swipe never starts a drag');
 sent.length=0;p(background,'pointerdown',100,20);p(background,'pointerup',100,20);assert.deepEqual(sent,['b,1,1','b,1,0']);
 sent.length=0;p(surface,'pointerdown',100,150);p(surface,'pointermove',140,170);p(surface,'pointerup',140,170);
 assert.deepEqual(captures.at(-1),['surface',1]);assert.ok(sent.includes('m,480,240'));assert.ok(sent.includes('b,1,1')&&sent.includes('b,1,0'),'direct touch still drags on video');
 sent.length=0;p(background,'pointerdown',100,20);p(background,'pointermove',160,180);p(background,'pointerup',160,180);
 assert.ok(sent.some(s=>s.startsWith('m,')));assert.ok(!sent.some(s=>s.startsWith('b,')),'crossing video stays relative');
 sent.length=0;p(background,'pointerdown',100,20,1);p(background,'pointerdown',140,20,2);p(background,'pointermove',100,60,1);while(frames.length)frames.shift()(0);p(background,'pointerup',100,60,1);p(background,'pointerup',140,20,2);
 assert.ok(sent.some(s=>s.startsWith('sp,')));assert.ok(!sent.some(s=>s.startsWith('b,')));
 sent.length=0;p(background,'pointerdown',100,20);p(background,'pointercancel',100,20);p(background,'pointerup',100,20);assert.ok(!sent.some(s=>s.startsWith('b,')),'cancel does not click');
 sent.length=0;p(document.getElementById('left-btn'),'pointerdown',10,10);assert.deepEqual(sent,[],'control pointer input is not background input');
 sent.length=0;p(background,'pointerdown',100,20,9,'mouse');p(background,'pointermove',130,30,9,'mouse');p(background,'pointerup',130,30,9,'mouse');assert.ok(sent.includes('b,1,1')&&sent.includes('b,1,0')&&sent.some(s=>s.startsWith('m,')));
 const mode=document.getElementById('touch-mode-btn');mode.dispatchEvent(new Event('click'));assert.equal(mode.textContent,'Pad');mode.dispatchEvent(new Event('click'));assert.equal(mode.textContent,'Direct');
 sent.length=0;p(background,'pointerdown',100,20,7);await new Promise(r=>setTimeout(r,580));p(background,'pointermove',132,4,7);p(background,'pointerup',132,4,7);
 assert.deepEqual(sent,['k,65363,1','k,65363,0','k,65363,1','k,65363,0','k,65362,1','k,65362,0'],'hold then swipe emits arrows without mouse motion or drag');
 sent.length=0;const wheel=new Event('wheel',{cancelable:true});Object.assign(wheel,{deltaX:0,deltaY:2000,deltaMode:0});background.dispatchEvent(wheel);while(frames.length)frames.shift()(performance.now()+16);
 const chunks=sent.filter(s=>s.startsWith('sp,')).map(s=>s.split(',').slice(1).map(Number));assert.ok(chunks.length>1);assert.equal(chunks.reduce((sum,p)=>sum+p[1],0),9600,'large scrolls preserve their full distance');assert.ok(chunks.every(p=>Math.abs(p[1])<=1440),'scroll input stays below the wheel fallback event cap');
 console.log('PASS: Pad/Direct modes, blank-area hold-swipe arrows, relative swipes/taps, direct video input, two-finger scroll, lossless large-scroll chunking, cancellation, isolated controls, desktop mouse');
} finally {rmSync(dir,{recursive:true,force:true});}
