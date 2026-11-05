// Live end-to-end test: macOS-style browser events -> Voxl socket -> i3.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const run=(name,args)=>execFileSync(name,args,{encoding:'utf8',timeout:3000});
const workspaces=()=>JSON.parse(run('i3-msg',['-t','get_workspaces']));
const original=workspaces().find(w=>w.focused).name;
const env=run('systemctl',['show','voxl-stream.service','-p','Environment','--value']);
const password=env.match(/(?:^|\s)VOXL_PASSWORD=([^\s"]+)/)?.[1];
assert.ok(password,'Configured Voxl credential required');
const dir=mkdtempSync(join(tmpdir(),'voxl-workspaces-'));
let ws;
try {
  const bundle=join(dir,'keyboard.mjs');
  run('esbuild',['web/src/client/keyboard.ts','--bundle','--platform=node','--format=esm',`--outfile=${bundle}`]);
  const {setupKeyboard}=await import(pathToFileURL(bundle));
  ws=new WebSocket('ws://127.0.0.1:6901/ws?token='+encodeURIComponent(password));
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const kbd=new EventTarget();globalThis.window=new EventTarget();globalThis.document=new EventTarget();globalThis.HTMLElement=class {};
  setupKeyboard({kbd,surface:new EventTarget(),send:m=>ws.send(m),isMac:true,remoteMac:false,inIframe:true},{},()=>{});
  function key(type,code,value,altKey){const e=new Event(type,{cancelable:true});Object.assign(e,{code,key:value,altKey,ctrlKey:false,metaKey:false,repeat:false,isComposing:false,getModifierState:()=>false});kbd.dispatchEvent(e);}
  for(const [i,symbol] of ['¡','™','£','¢'].entries()){
    const n=i+1;
    key('keydown','AltLeft','Alt',true);key('keydown',`Digit${n}`,symbol,true);
    key('keyup',`Digit${n}`,symbol,true);key('keyup','AltLeft','Alt',false);
    let current;
    for(let attempt=0;attempt<20;attempt++){
      await new Promise(r=>setTimeout(r,50));
      current=workspaces().find(w=>w.focused);
      if(current.num===n)break;
    }
    assert.equal(current.num,n,`Option+${n} switches workspace`);
    console.log(`PASS: macOS Option+${n} (${symbol}) -> ${current.name}`);
  }
  for (const n of [1,2,3,4]) {
    for (const type of ['keydown','keyup']) {
      const e=new Event(type,{cancelable:true});
      Object.assign(e,{code:`Digit${n}`,key:'¡™£¢'[n-1],altKey:type==='keydown',ctrlKey:false,metaKey:false,repeat:false,isComposing:false,getModifierState:()=>false});
      document.dispatchEvent(e);
    }
    let current;
    for(let attempt=0;attempt<20;attempt++) {
      await new Promise(r=>setTimeout(r,50));
      current=workspaces().find(w=>w.focused);if(current.num===n)break;
    }
    assert.equal(current.num,n);
    console.log(`PASS: unfocused surface + missing Option-down -> ${current.name}`);
  }
} finally {
  ws?.send('r');ws?.close();
  run('i3-msg',['workspace',original]);
  rmSync(dir,{recursive:true,force:true});
}
