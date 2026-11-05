import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'voxl-viewport-'));
try{
 execFileSync('esbuild',['web/src/client/viewport.ts','--bundle','--platform=node','--format=esm',`--outfile=${join(dir,'viewport.mjs')}`]);
 const {viewportBounds}=await import(pathToFileURL(join(dir,'viewport.mjs')));
 const vp=(width,height,offsetTop=0,offsetLeft=0,scale=1)=>({width,height,offsetTop,offsetLeft,scale});
 assert.deepEqual(viewportBounds(null,834,1180),{width:834,height:1180,left:0,top:0,bottom:0,keyboardOpen:false});
 let r=viewportBounds(vp(834,780),834,1180);assert.equal(r.bottom,400);assert.equal(r.keyboardOpen,true);
 r=viewportBounds(vp(834,980),834,1180);assert.equal(r.keyboardOpen,true,'partial-height iPad keyboard is recognized');
 r=viewportBounds(vp(834,780,80),834,1180);assert.equal(r.bottom,320);assert.equal(r.top,80);
 r=viewportBounds(vp(417,590,40,100,2),834,1180);assert.equal(r.keyboardOpen,false,'pinch zoom is not a keyboard');assert.equal(r.left,100);
 assert.equal(viewportBounds(vp(834,1100),834,1180).keyboardOpen,false,'browser bar height change is not a keyboard');
 assert.equal(viewportBounds(vp(390,900,100),390,844).bottom,0);
 console.log('PASS: normal/docked/partial-height iPad keyboards, viewport panning, pinch zoom, browser bars and nonnegative offsets');
}finally{rmSync(dir,{recursive:true,force:true});}
