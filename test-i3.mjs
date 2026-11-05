import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'voxl-i3-'));
try{
 const bundle=join(dir,'i3.mjs');
 execFileSync('esbuild',['web/src/client/i3.ts','--bundle','--platform=node','--format=esm',`--outfile=${bundle}`]);
 const {sendI3Chord,I3_ACTIONS,setupI3}=await import(pathToFileURL(bundle));
 const sent=[];sendI3Chord(m=>sent.push(m),[65513,65505,50]);
 assert.deepEqual(sent,['r','k,65513,1','k,65505,1','k,50,1','k,50,0','k,65505,0','k,65513,0','r']);
 assert.deepEqual(I3_ACTIONS.terminal,[65513,65293]);
 assert.deepEqual(I3_ACTIONS.files,[65513,65505,101]);
 assert.deepEqual(I3_ACTIONS.tabbed,[65513,119]);
 function element(dataset={}){const e=new EventTarget(),classes=new Set();e.dataset=dataset;e.attrs={};e.classList={toggle(c,on){if(on)classes.add(c);else classes.delete(c);},contains:c=>classes.has(c)};e.setAttribute=(k,v)=>e.attrs[k]=v;e.click=()=>e.dispatchEvent(new Event('click'));return e;}
 const elements=Object.fromEntries(['i3-btn','i3-panel'].map(id=>[id,element()]));
 const panel=elements['i3-panel'];panel.hidden=true;
 const workspace=[1,2,3,4].map(n=>element({workspace:String(n)}));
 const actions=Object.keys(I3_ACTIONS).map(action=>element({i3:action}));
 panel.querySelectorAll=selector=>selector==='[data-workspace]'?workspace:actions;
 globalThis.document=new EventTarget();document.getElementById=id=>elements[id];globalThis.window=new EventTarget();
 const app={surface:element(),tools:element(),send:m=>sent.push(m),readOnly:false,remoteMac:false};
 let layouts=0;setupI3(app,()=>layouts++);
 elements['i3-btn'].click();assert.equal(panel.hidden,false);assert.equal(app.tools.classList.contains('i3-open'),true);
 sent.length=0;workspace[1].click();assert.deepEqual(sent,['r','k,65513,1','k,50,1','k,50,0','k,65513,0','r']);
 sent.length=0;workspace[2].click();assert.ok(sent.includes('k,51,1'));assert.ok(!sent.includes('k,65505,1'),'workspace buttons only switch, never move windows');
 app.readOnly=true;sent.length=0;workspace[0].click();assert.deepEqual(sent,[]);
 app.readOnly=false;app.remoteMac=true;actions[0].click();assert.deepEqual(sent,[]);
 app.remoteMac=false;window.confirm=()=>{throw Error('Close must not open a dialog')};sent.length=0;
 actions.find(e=>e.dataset.i3==='close').click();assert.ok(sent.includes('k,65505,1')&&sent.includes('k,113,1'),'close immediately sends Alt+Shift+Q without a dialog');
 elements['i3-btn'].click();assert.equal(panel.hidden,true);assert.equal(layouts,2);
 console.log('PASS: i3 key order/release, workspace switching without move control, launch/layout mappings, drawer state, read-only/Mac guards');
 if(process.argv.includes('--live')){
  const run=(name,args)=>execFileSync(name,args,{encoding:'utf8',timeout:3000});
  const workspaces=()=>JSON.parse(run('i3-msg',['-t','get_workspaces']));
  const original=workspaces().find(w=>w.focused).name;
  const env=run('systemctl',['show','voxl-stream.service','-p','Environment','--value']);
  const pw=env.match(/(?:^|\s)VOXL_PASSWORD=([^\s"]+)/)?.[1];assert.ok(pw);
  const ws=new WebSocket('ws://127.0.0.1:6901/ws?token='+encodeURIComponent(pw));
  try{
   await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
   for(const n of [1,2,3,4]){
    sendI3Chord(m=>ws.send(m),[65513,48+n]);
    let current;for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,50));current=workspaces().find(w=>w.focused);if(current.num===n)break;}
    assert.equal(current.num,n);console.log(`PASS: i3 drawer chord -> ${current.name}`);
   }
  }finally{ws.send('r');ws.close();run('i3-msg',['workspace',original]);}
 }
}finally{rmSync(dir,{recursive:true,force:true});}
