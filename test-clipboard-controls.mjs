import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'voxl-clipboard-'));
try{
 const bundle=join(dir,'clipboard.mjs');execFileSync('esbuild',['web/src/client/clipboard-controls.ts','--bundle','--platform=node','--format=esm',`--outfile=${bundle}`]);
 const {setupClipboardControls}=await import(pathToFileURL(bundle));
 const ids=['clipboard-local','clipboard-remote','clipboard-status','terminal-clipboard-btn','copy-selection-btn','cut-selection-btn','paste-remote-btn','paste-device-btn','send-clipboard-btn','copy-device-btn'];
 const elements={};for(const id of ids){const e=new EventTarget();e.value='';e.attrs={};e.classList={toggle(){}};e.setAttribute=(k,v)=>e.attrs[k]=v;e.section={open:false};e.closest=()=>e.section;e.focus=()=>e.focused=true;e.select=()=>e.selected=true;e.click=()=>e.dispatchEvent(new Event('click'));elements[id]=e;}
 globalThis.document={getElementById:id=>elements[id]};
 const raw=new EventTarget();raw.dataset={remoteKey:'ctrl-c'};raw.click=()=>raw.dispatchEvent(new Event('click'));
 const arrows=[65361,65362,65364,65363].map(key=>{const b=new EventTarget();b.dataset={remoteKey:String(key)};b.click=()=>b.dispatchEvent(new Event('click'));return b;});
 const sent=[],noted=[],written=[];const app={surface:new EventTarget(),modifiers:new Set(),tools:{querySelectorAll:()=>[raw,...arrows]},send:m=>sent.push(m),readOnly:false,remoteMac:false};
 app.surface.addEventListener('voxl-release-input',()=>app.modifiers.clear());
 Object.defineProperty(globalThis.navigator,'clipboard',{configurable:true,value:{readText:async()=> 'from device',writeText:async text=>written.push(text)}});
 setupClipboardControls(app,{getText:()=> 'from VM',noteLocal:text=>noted.push(text)});
 elements['copy-selection-btn'].click();assert.ok(sent.includes('k,65507,1')&&sent.includes('k,99,1'));
 sent.length=0;raw.click();assert.ok(sent.includes('k,99,1'));
 elements['terminal-clipboard-btn'].click();sent.length=0;elements['copy-selection-btn'].click();assert.ok(sent.includes('k,65505,1'));
 sent.length=0;elements['cut-selection-btn'].click();assert.deepEqual(sent,[],'terminal cut is not silently mapped to an invalid chord');
 sent.length=0;elements['paste-device-btn'].click();await new Promise(setImmediate);
 assert.equal(sent[0],'c,from device');assert.ok(sent.includes('k,118,1')&&sent.includes('k,65505,1'));assert.equal(noted.at(-1),'from device');
 sent.length=0;elements['clipboard-local'].value='manual text';elements['send-clipboard-btn'].click();assert.equal(sent[0],'c,manual text');
 elements['copy-device-btn'].click();await new Promise(setImmediate);assert.equal(written.at(-1),'from VM');
 navigator.clipboard.readText=async()=>{throw Error('denied')};elements['paste-device-btn'].click();await new Promise(setImmediate);assert.equal(elements['clipboard-local'].focused,true);assert.equal(elements['clipboard-local'].section.open,true);assert.match(elements['clipboard-status'].textContent,/Paste text/);
 navigator.clipboard.writeText=async()=>{throw Error('denied')};elements['copy-device-btn'].click();await new Promise(setImmediate);assert.equal(elements['clipboard-remote'].selected,true);assert.equal(elements['clipboard-remote'].section.open,true);
 for(const arrow of arrows){sent.length=0;app.modifiers.add(65507);arrow.click();assert.deepEqual(sent,[`k,${arrow.dataset.remoteKey},1`,`k,${arrow.dataset.remoteKey},0`]);assert.ok(app.modifiers.has(65507),'arrow taps preserve latched Ctrl');}
 sent.length=0;app.readOnly=true;elements['send-clipboard-btn'].click();raw.click();arrows[0].click();assert.deepEqual(sent,[]);
 console.log('PASS: Ctrl+C, copy/cut/paste, terminal Ctrl+Shift shortcuts, device paste ordering, manual text fallback, local copy fallback, read-only guards');
}finally{rmSync(dir,{recursive:true,force:true});}
