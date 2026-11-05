import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'voxl-modifiers-'));
try{
 for(const name of ['modifiers','keyboard'])execFileSync('esbuild',[`web/src/client/${name}.ts`,'--bundle','--platform=node','--format=esm',`--outfile=${join(dir,name+'.mjs')}`]);
 const {setupKeyboard}=await import(pathToFileURL(join(dir,'keyboard.mjs')));
 const {setupModifiers}=await import(pathToFileURL(join(dir,'modifiers.mjs')));
 class Element extends EventTarget {
  constructor(){super();this.attrs={};this.dataset={};this.classes=new Set();this.classList={toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};}
  setAttribute(k,v){this.attrs[k]=v;}click(){this.dispatchEvent(new Event('click'));}
 }
 globalThis.HTMLElement=Element;globalThis.document=new EventTarget();globalThis.window=new EventTarget();
 const buttons=['ctrl','alt','super'].map(name=>{const b=new Element();b.dataset.modifier=name;return b;});
 const tools=new Element();tools.querySelectorAll=()=>buttons;
 const sent=[],surface=new Element(),kbd=new Element();
 const app={surface,kbd,tools,modifiers:new Set(),send:m=>sent.push(m),isMac:true,remoteMac:false,inIframe:true,readOnly:false};
 setupKeyboard(app,{},()=>{});setupModifiers(app);
 function key(type,code,value,flags={}){const e=new Event(type,{cancelable:true});Object.assign(e,{code,key:value,altKey:false,ctrlKey:false,metaKey:false,isComposing:false,repeat:false,getModifierState:()=>false,...flags});kbd.dispatchEvent(e);}
 buttons[0].click();assert.equal(buttons[0].attrs['aria-pressed'],'true');assert.equal(sent.at(-1),'k,65507,1');
 key('keydown','KeyC','c');key('keyup','KeyC','c');assert.deepEqual(sent.slice(-2),['k,99,1','k,99,0']);assert.ok(app.modifiers.has(65507));
 surface.dispatchEvent(new Event('voxl-release-pointer'));assert.ok(app.modifiers.has(65507),'pointer-only resets preserve modifiers');
 buttons[1].click();buttons[2].click();key('keydown','Digit2','™');key('keyup','Digit2','™');assert.ok(sent.includes('k,50,1'));assert.ok(sent.includes('k,65515,1'),'Super is actual Super, not Mac Command-to-Ctrl mapping');
 sent.length=0;key('keydown','ControlLeft','Control',{ctrlKey:true});key('keyup','ControlLeft','Control');assert.deepEqual(sent.slice(-2),['k,65507,0','k,65507,1'],'physical keyup cannot cancel a latched Ctrl');
 const down=new Event('pointerdown',{cancelable:true});buttons[0].dispatchEvent(down);assert.equal(down.defaultPrevented,true,'modifier does not steal keyboard focus');
 surface.dispatchEvent(new Event('voxl-release-input'));assert.equal(app.modifiers.size,0);assert.ok(buttons.every(b=>b.attrs['aria-pressed']==='false'));
 buttons[0].click();window.dispatchEvent(new Event('blur'));assert.equal(app.modifiers.size,0);
 app.readOnly=true;sent.length=0;buttons[0].click();assert.deepEqual(sent,[]);
 console.log('PASS: latched Ctrl/Alt/Super, typing/chords, physical modifier release, pointer-only resets, no focus theft, blur/full reset, read-only guards');
}finally{rmSync(dir,{recursive:true,force:true});}
