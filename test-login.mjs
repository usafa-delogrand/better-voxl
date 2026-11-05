// Live HTTP/WebSocket regression test: no Basic credential replay is needed after login.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const env=execFileSync('systemctl',['show','voxl-stream.service','-p','Environment','--value'],{encoding:'utf8'});
const password=env.match(/(?:^|\s)VOXL_PASSWORD=([^\s"]+)/)?.[1];
assert.ok(password,'Configured Voxl credential required');
const base='http://127.0.0.1:6901';
const page=await fetch(base+'/',{headers:{Authorization:'Basic '+Buffer.from('drew:'+password).toString('base64')}});
assert.equal(page.status,200);
const html=await page.text(),setCookie=page.headers.get('set-cookie');
assert.ok(setCookie?.includes('HttpOnly')&&setCookie.includes('SameSite=Lax'));
assert.ok(page.headers.get('cache-control').includes('no-store'));
assert.equal(page.headers.get('referrer-policy'),'no-referrer');
const token=html.match(/name="voxl-session" content="([a-f0-9]{64})"/)?.[1];
assert.ok(token);assert.notEqual(token,password);
const cookie=setCookie.split(';')[0];
for(const path of ['/','/stats','/files/list?path=']){
 const r=await fetch(base+path,{headers:{Cookie:cookie}});assert.equal(r.status,200,`Cookie authenticates ${path}`);await r.arrayBuffer();
}
console.log('PASS: one Basic login issues an HttpOnly cookie covering page, stats, and files');
for(const path of ['/stats','/files/list?path=']){
 const r=await fetch(base+path+(path.includes('?')?'&':'?')+'session='+token);assert.equal(r.status,200);await r.arrayBuffer();
}
console.log('PASS: page capability authenticates requests without cookies (embedded mobile browsers)');
for(let i=0;i<2;i++){
 const ws=new WebSocket('ws://127.0.0.1:6901/ws?session='+token);
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{ws.close();reject(Error('Socket timeout'));},4000);ws.onmessage=e=>{if(typeof e.data==='string'&&JSON.parse(e.data).t==='hello'){clearTimeout(timeout);resolve();}};ws.onerror=()=>{clearTimeout(timeout);reject(Error('Socket failed'));};});
 ws.close();
}
console.log('PASS: socket connects and reconnects without replaying Basic credentials');
for(const path of ['/ws','/files/list?path=','/stats?session=invalid']){
 const r=await fetch(base+path);assert.equal(r.status,401);assert.equal(r.headers.get('www-authenticate'),null);
}
const anonymous=await fetch(base+'/');assert.equal(anonymous.status,401);assert.ok(anonymous.headers.get('www-authenticate')?.startsWith('Basic '));
console.log('PASS: expired/anonymous subrequests do not reopen Basic prompts; unauthenticated pages remain protected');
