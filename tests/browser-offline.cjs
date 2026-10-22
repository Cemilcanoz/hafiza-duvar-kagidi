'use strict';
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.join(__dirname,'..'),runtime=path.join(root,'runtime'),out=path.join(runtime,'acceptance');
 const testRuntime=fs.mkdtempSync(path.join(runtime,'offline-test-'));
 const config={...JSON.parse(fs.readFileSync(path.join(runtime,'config.json'))),port:47839};
 fs.writeFileSync(path.join(testRuntime,'config.json'),JSON.stringify(config));
 for(const name of ['snapshot.json','wallpaper','state.json'])if(fs.existsSync(path.join(runtime,name)))fs.copyFileSync(path.join(runtime,name),path.join(testRuntime,name));
 fs.writeFileSync(path.join(testRuntime,'state.json'),JSON.stringify({mode:'graph',imageType:'image/png'}));
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,HAFIZA_RUNTIME:testRuntime},windowsHide:true,stdio:['ignore','pipe','pipe']});
 const base='http://127.0.0.1:47839';
 try{
  for(let i=0;i<40;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{const page=await browser.newPage({viewport:{width:1600,height:900},reducedMotion:'reduce'});await page.goto(base);
   await page.waitForFunction(()=>window.hafiza?.diagnostics().settled&&window.hafiza.diagnostics().nodes>0&&window.hafiza.diagnostics().imageReady);
   const before=await page.evaluate(()=>window.hafiza.diagnostics());
   const point=await page.evaluate(()=>window.hafiza.interactionPoints().find(n=>n.x>400&&n.x<1200&&n.y>120&&n.y<700));
   const gesture=()=>fetch(base+'/api/gesture',{method:'POST',headers:{'Content-Type':'application/json','X-Control-Token':config.token},body:JSON.stringify({factor:1.2,xRatio:point.x/1600,yRatio:point.y/900})});
   assert.equal((await gesture()).status,200);await page.waitForFunction(()=>window.hafiza.diagnostics().view.zoom>1);
   const anchored=await page.evaluate(id=>window.hafiza.interactionPoints().find(n=>n.id===id),point.id);assert.ok(Math.abs(anchored.x-point.x)<.001&&Math.abs(anchored.y-point.y)<.001);
   await page.evaluate(()=>window.hafiza.setMode('image'));await page.waitForFunction(()=>window.hafiza.diagnostics().amount===1&&!window.hafiza.diagnostics().transitioning);const imageZoom=await page.evaluate(()=>window.hafiza.diagnostics().view.zoom);
   await gesture();await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>window.hafiza.diagnostics().view.zoom),imageZoom);
   await page.evaluate(()=>window.hafiza.setMode('graph'));await page.waitForFunction(()=>window.hafiza.diagnostics().amount===0&&!window.hafiza.diagnostics().transitioning);
   child.kill();await new Promise(r=>child.once('exit',r));
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('kesildi'));
   await page.evaluate(()=>window.livelyPropertyListener('mode',1));await page.waitForFunction(()=>window.hafiza.diagnostics().amount===1&&!window.hafiza.diagnostics().transitioning);
   await page.evaluate(()=>window.livelyPropertyListener('mode',0));await page.waitForFunction(()=>window.hafiza.diagnostics().amount===0&&!window.hafiza.diagnostics().transitioning);
   const after=await page.evaluate(()=>window.hafiza.diagnostics());assert.deepEqual(after.positions,before.positions);
   const report={testedAt:new Date().toISOString(),bridgeProcessTerminated:true,existingPageRetainsGraph:true,preloadedImageToggleViaLivelyCallback:true,positionsUnchanged:true,sseNormalizedZoomCursorAnchored:true,sseZoomIgnoredInImageMode:true,nodes:after.nodes,edges:after.edges,limitation:'A fresh page requires the local bridge to serve HTML; no offline service worker is installed.'};
   fs.writeFileSync(path.join(out,'bridge-offline-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
 }finally{if(child.exitCode===null)child.kill();}
})().catch(e=>{console.error(e);process.exit(1);});
