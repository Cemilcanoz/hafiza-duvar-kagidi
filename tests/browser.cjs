'use strict';
// npm install --no-save --package-lock=false playwright@1.56.1
// Requires the local bridge running with a real MetadataCache snapshot and image.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const base=process.env.HAFIZA_URL||'http://127.0.0.1:47831';
 const out=path.join(__dirname,'../runtime/acceptance');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state=await fetch(base+'/api/state').then(r=>r.json());
 async function post(endpoint,body){const r=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Control-Token':state.token},body:JSON.stringify(body)});assert.equal(r.status,200);}
 await post('/api/mode',{mode:'graph'});
 await page.goto(base);await page.waitForFunction(()=>window.hafiza?.diagnostics().nodes>0);
 await page.waitForFunction(()=>window.hafiza.diagnostics().settled,{},{timeout:30000});
 await page.waitForFunction(()=>!window.hafiza.diagnostics().rafPending);
 const diag=()=>page.evaluate(()=>window.hafiza.diagnostics());
 const initial=await diag();assert.ok(initial.nodes>0,'Real vault snapshot required');
 const snapshot=await fetch(base+'/api/snapshot').then(r=>r.json());assert.equal(initial.edges,snapshot.edges.length);
 await page.screenshot({path:path.join(out,'graph.png')});
 await page.waitForTimeout(5000);const graphIdle=await diag();
 assert.equal(graphIdle.frames,initial.frames);assert.equal(graphIdle.workerMessages,initial.workerMessages);
 const nav=await page.evaluate(()=>performance.timeOrigin);
 const focusedBefore=await page.evaluate(()=>document.activeElement.tagName);
 await post('/api/mode',{mode:'image'});await page.waitForFunction(()=>window.hafiza.diagnostics().amount===1&&!window.hafiza.diagnostics().transitioning);
 const image=await diag();assert.ok(image.lastTransitionMs>=480&&image.lastTransitionMs<650);assert.deepEqual(image.positions,initial.positions);
 await page.screenshot({path:path.join(out,'image.png')});
 await page.waitForTimeout(5000);const imageIdle=await diag();assert.equal(imageIdle.frames,image.frames);assert.equal(imageIdle.workerMessages,image.workerMessages);
 await post('/api/mode',{mode:'graph'});await page.waitForFunction(()=>window.hafiza.diagnostics().amount===0&&!window.hafiza.diagnostics().transitioning);
 assert.deepEqual((await diag()).positions,initial.positions);
 for(const mode of ['image','graph','image','graph','image']){await post('/api/mode',{mode});await page.waitForTimeout(65);}
 await page.waitForFunction(()=>window.hafiza.diagnostics().amount===1&&!window.hafiza.diagnostics().transitioning);
 assert.equal((await diag()).target,'image');assert.equal(await page.evaluate(()=>performance.timeOrigin),nav);
 assert.equal(await page.evaluate(()=>document.activeElement.tagName),focusedBefore);
 await post('/api/mode',{mode:'graph'});await page.waitForFunction(()=>window.hafiza.diagnostics().amount===0&&!window.hafiza.diagnostics().transitioning);
 await page.reload();await page.waitForFunction(()=>window.hafiza?.diagnostics().nodes>0&&window.hafiza.diagnostics().settled);
 assert.deepEqual((await diag()).positions,initial.positions);assert.equal((await diag()).workerMessages,0);
 // Simulate absent image at HTTP boundary without modifying the user's choice.
 const missing=await context.newPage();await missing.route('**/api/image?*',r=>r.fulfill({status:404,body:'missing'}));await missing.goto(base);
 await missing.waitForFunction(()=>window.hafiza?.diagnostics().nodes>0&&!window.hafiza.diagnostics().imagePending);
 await missing.evaluate(()=>window.hafiza.setMode('image'));assert.equal((await missing.evaluate(()=>window.hafiza.diagnostics())).amount,0);
 assert.match(await missing.locator('#error').textContent(),/resim/i);await missing.close();
 // A viewport redraw preserves coordinates (actual bridge termination is tested separately).
 await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.waitForTimeout(100);
 assert.deepEqual((await diag()).positions,initial.positions);
 assert.deepEqual(errors,[]);
 const report={testedAt:new Date().toISOString(),browser:'Microsoft Edge / Playwright 1.56.1',snapshot:{nodes:snapshot.nodes.length,edges:snapshot.edges.length,generatedAt:snapshot.generatedAt},transitionMs:image.lastTransitionMs,graphIdle5s:{frames:graphIdle.frames-initial.frames,workerMessages:graphIdle.workerMessages-initial.workerMessages},imageIdle5s:{frames:imageIdle.frames-image.frames,workerMessages:imageIdle.workerMessages-image.workerMessages},reloadPreservedPositions:true,rapidLatestTarget:true,sameDocument:true,focusUnchanged:true,missingImageKeepsGraph:true,errors};
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
