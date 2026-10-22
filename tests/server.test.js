'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'hafiza-server-'));process.env.HAFIZA_RUNTIME=runtime;
const {validateSnapshot,validateAppearance,createServer,config}=require('../server');
after(()=>fs.rmSync(runtime,{recursive:true,force:true}));
const sample={schema:1,generatedAt:new Date().toISOString(),nodes:[{id:'Türkçe.md',label:'Türkçe',body:'MUST NOT PASS'},{id:'A.md',label:'A'}],edges:[{source:'A.md',target:'Türkçe.md',count:2,body:'MUST NOT PASS'}],body:'MUST NOT PASS'};
test('snapshot allowlist drops all note bodies and rejects invalid graph references',()=>{
 const out=validateSnapshot(sample);assert(!JSON.stringify(out).includes('MUST NOT PASS'));assert.equal(out.edges[0].count,2);
 assert.throws(()=>validateSnapshot({...sample,edges:[{source:'A.md',target:'missing',count:1}]}));
 assert.throws(()=>validateSnapshot({...sample,nodes:[sample.nodes[0],sample.nodes[0]]}));
});
test('appearance accepts literal colors and drops unrelated fields',()=>{
 const input={background:'#AABBCC',motion:'organic',style:'glow',live:true,folderColors:{'Türkçe':'#112233'},nodeColors:{'Türkçe/A.md':'#CCDDEE'},body:'DROP'};
 const result=validateAppearance(input);assert.equal(result.background,'#aabbcc');assert.equal(result.nodeColors['Türkçe/A.md'],'#ccddee');assert(!JSON.stringify(result).includes('DROP'));
 assert.throws(()=>validateAppearance({...input,background:'url(https://evil.test)'}));
 assert.throws(()=>validateAppearance({...input,nodeColors:{'A.md':'red;'} }));
});
test('loopback API rejects cross origin and unauthenticated writes; caches valid snapshot',async()=>{
 const opened=[];const server=createServer({openUri:async uri=>opened.push(uri)});await new Promise(r=>server.listen(0,'127.0.0.1',r));const address=server.address();config.port=address.port;
 const call=(url,opts={})=>fetch(`http://127.0.0.1:${address.port}${url}`,{...opts,headers:{Host:`127.0.0.1:${config.port}`,...opts.headers}});
 try {
 assert.equal((await call('/api/state',{headers:{Origin:'https://evil.test'}})).status,403);
 assert.equal((await call('/api/snapshot',{method:'POST',body:JSON.stringify(sample)})).status,401);
 assert.equal((await call('/api/snapshot',{method:'POST',headers:{Authorization:`Bearer ${config.token}`},body:JSON.stringify(sample)})).status,200);
 const saved=await (await call('/api/snapshot')).json();assert.equal(saved.nodes.length,2);assert(!JSON.stringify(saved).includes('MUST NOT PASS'));
 const auth={Authorization:`Bearer ${config.token}`};
 const appearance={background:'#102d2b',motion:'organic',style:'ink',live:true,folderColors:{'Türkçe':'#ffcc88'},nodeColors:{'Türkçe.md':'#ccddee'}};
 assert.equal((await call('/api/appearance',{method:'POST',body:JSON.stringify(appearance)})).status,401);
 assert.equal((await call('/api/appearance',{method:'POST',headers:auth,body:JSON.stringify(appearance)})).status,200);
 assert.deepEqual((await (await call('/api/state')).json()).appearance,appearance);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runtime,'appearance.json'),'utf8')),appearance);
 assert.equal((await call('/api/gesture',{method:'POST',headers:auth,body:JSON.stringify({factor:1.1,xRatio:.5,yRatio:.5})})).status,200);
 assert.equal((await call('/api/gesture',{method:'POST',headers:auth,body:JSON.stringify({factor:Infinity,xRatio:.5,yRatio:.5})})).status,400);
 assert.equal((await call('/api/gesture',{method:'POST',headers:auth,body:JSON.stringify({factor:1.1,xRatio:3,yRatio:.5})})).status,400);
 assert.equal((await call('/api/open',{method:'POST',body:JSON.stringify({id:'A.md'})})).status,401);
 assert.equal((await call('/api/open',{method:'POST',headers:auth,body:JSON.stringify({id:'cmd.exe'})})).status,404);
 assert.equal(opened.length,0);
 assert.equal((await call('/api/open',{method:'POST',headers:auth,body:JSON.stringify({id:'Türkçe.md'})})).status,200);
 assert.equal(opened[0],'obsidian://open?vault=CemoOS&file=T%C3%BCrk%C3%A7e.md');
 assert.equal((await call('/api/explore',{method:'POST',headers:auth,body:'{}'})).status,200);
 assert.equal(opened[1],`http://127.0.0.1:${config.port}/?explore=1`);
 const withMissing={...sample,nodes:[...sample.nodes,{id:'unresolved:Eksik',label:'Eksik',unresolved:true}]};
 assert.equal((await call('/api/snapshot',{method:'POST',headers:auth,body:JSON.stringify(withMissing)})).status,200);
 assert.equal((await call('/api/open',{method:'POST',headers:auth,body:JSON.stringify({id:'unresolved:Eksik'})})).status,409);
 assert.equal(opened.length,2);
 assert.equal((await (await call('/api/state')).json()).wallpaperActive,false);
 const disconnect=new AbortController();
 const stream=await call('/api/events?client=wallpaper',{signal:disconnect.signal});
 await stream.body.getReader().read();
 assert.equal((await (await call('/api/state')).json()).wallpaperActive,true);
 disconnect.abort();
 for(let i=0;i<20&&(await (await call('/api/state')).json()).wallpaperActive;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal((await (await call('/api/state')).json()).wallpaperActive,false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(runtime,'snapshot.json'),'utf8')).edges[0].count,2);
 assert.equal((await call('/api/mode',{method:'POST',headers:{Authorization:`Bearer ${config.token}`},body:JSON.stringify({mode:'image'})})).status,409);
 assert.equal((await call('/../../server.js')).status,404);
 } finally {await new Promise(r=>server.close(r));}
});
