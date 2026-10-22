'use strict';
const{chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const harness=await require('./browser-harness.cjs')(47840,{live:false}),base=harness.base,out=path.join(__dirname,'../runtime/acceptance');
 const state=await fetch(base+'/api/state').then(r=>r.json());await fetch(base+'/api/mode',{method:'POST',headers:{'Content-Type':'application/json','X-Control-Token':state.token},body:JSON.stringify({mode:'graph'})});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:900}}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const endpoint of ['open','explore'])await page.route('**/api/'+endpoint,async route=>{requests.push({endpoint,body:route.request().postDataJSON(),token:!!route.request().headers()['x-control-token']});await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});});
  const diag=()=>page.evaluate(()=>window.hafiza.diagnostics());
  await page.goto(base+'/?explore=1');await page.waitForFunction(()=>window.hafiza?.diagnostics().settled&&window.hafiza.diagnostics().nodes>0&&window.hafiza.diagnostics().imageReady);
  await page.waitForTimeout(100);const initial=await diag();
  await page.screenshot({path:path.join(out,'hermes-atlas.png')});
  let point=await page.evaluate(()=>window.hafiza.interactionPoints().filter(n=>!n.unresolved&&n.degree>1&&n.x>600&&n.x<1170&&n.y>180&&n.y<650).sort((a,b)=>b.degree-a.degree)[0]);assert.ok(point,'Visible linked real node');
  await page.mouse.move(point.x,point.y);await page.waitForTimeout(50);assert.equal((await diag()).hoverNode,point.id);assert.equal(await page.locator('#tooltip').isVisible(),true);
  await page.mouse.click(point.x,point.y);assert.equal((await diag()).selectedNode,point.id);assert.equal(await page.locator('#selection').isVisible(),true);assert.equal(await page.locator('#selected-label').textContent(),point.label);
  const snapshot=await fetch(base+'/api/snapshot').then(r=>r.json()),outgoing=new Set(snapshot.edges.filter(e=>e.source===point.id).map(e=>e.target)),incoming=new Set(snapshot.edges.filter(e=>e.target===point.id).map(e=>e.source));
  assert.equal(await page.locator('#connections h3').nth(0).textContent(),`GİDEN BAĞLANTILAR / ${outgoing.size}`);assert.equal(await page.locator('#connections h3').nth(1).textContent(),`GELEN BAĞLANTILAR / ${incoming.size}`);
  await page.locator('#open-note').click();assert.deepEqual(requests[0],{endpoint:'open',body:{id:point.id},token:true});
  await page.mouse.move(500,100);await page.waitForTimeout(950);const selectedIdle=await diag();await page.waitForTimeout(1100);assert.equal((await diag()).frames,selectedIdle.frames);assert.equal((await diag()).workerMessages,selectedIdle.workerMessages);
  await page.screenshot({path:path.join(out,'hermes-selected.png')});
  // Pan on empty Canvas; no modifier or mouse-move button flags required.
  await page.mouse.move(25,450);await page.mouse.down();await page.mouse.move(115,490,{steps:7});await page.mouse.up();let d=await diag();assert.equal(d.view.offsetX,90);assert.equal(d.view.offsetY,40);assert.equal(d.pans,1);
  point=await page.evaluate(id=>window.hafiza.interactionPoints().find(n=>n.id===id),point.id);
  await page.mouse.move(point.x,point.y);const anchor={x:point.x,y:point.y};await page.mouse.wheel(0,-120);await page.waitForTimeout(70);const zoomed=await page.evaluate(id=>window.hafiza.interactionPoints().find(n=>n.id===id),point.id);assert.ok((await diag()).view.zoom>1);assert.ok(Math.abs(zoomed.x-anchor.x)<1&&Math.abs(zoomed.y-anchor.y)<1,'Wheel anchors world under cursor within browser pointer pixel rounding');
  await page.locator('#zoom-in').click();assert.ok((await diag()).view.zoom>1.5);await page.locator('#zoom-out').click();await page.locator('#reset-view').click();d=await diag();assert.equal(d.view.zoom,1);assert.equal(d.view.offsetX,0);assert.equal(d.view.offsetY,0);
  point=await page.evaluate(id=>window.hafiza.interactionPoints().find(n=>n.id===id),point.id);const beforeDrag=await diag();
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+45,point.y+36,{steps:8});await page.mouse.up();const afterDrag=await diag();assert.equal(afterDrag.nodeDrags,1);assert.notDeepEqual(afterDrag.positions,beforeDrag.positions);
  const changed=afterDrag.positions.filter((n,i)=>JSON.stringify(n)!==JSON.stringify(beforeDrag.positions[i]));assert.equal(changed.length,1);assert.equal(changed[0][0],point.id);
  await page.reload();await page.waitForFunction(()=>window.hafiza?.diagnostics().settled&&window.hafiza.diagnostics().nodes>0);assert.deepEqual((await diag()).positions,afterDrag.positions);
  const searchNode=snapshot.nodes.find(n=>!n.unresolved&&n.label.includes('Hafıza'))||snapshot.nodes.find(n=>!n.unresolved);
  await page.locator('#search').fill(searchNode.label);assert.ok(await page.locator('.search-result').count());await page.locator('#search').press('ArrowDown');await page.locator('#search').press('ArrowUp');await page.locator('#search').press('Enter');assert.ok((await diag()).selectedNode);assert.equal(await page.locator('#search-results').isVisible(),false);
  const firstLink=page.locator('.connection').first();if(await firstLink.count()){const id=await firstLink.getAttribute('data-id');await firstLink.click();assert.equal((await diag()).selectedNode,id);}
  const missing=snapshot.nodes.find(n=>n.unresolved);if(missing){await page.locator('#search').fill(missing.label);const result=page.locator('.search-result').filter({hasText:missing.id}).first();await result.click();assert.equal((await diag()).selectedNode,missing.id);assert.equal(await page.locator('#open-note').isDisabled(),true);}
  await page.locator('#search').fill('NOT_FOUND_UNIQUE_9823');assert.match(await page.locator('#search-results').textContent(),/eşleşen not yok/);await page.locator('#search').press('Escape');
  await page.locator('#live').click();const liveBefore=await diag();await page.waitForTimeout(400);assert.ok((await diag()).frames>liveBefore.frames);assert.equal((await diag()).workerMessages,liveBefore.workerMessages);await page.locator('#live').click();await page.waitForTimeout(950);const liveStopped=await diag();await page.waitForTimeout(400);assert.equal((await diag()).frames,liveStopped.frames);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#live').click();assert.equal((await diag()).live,false);assert.match(await page.locator('#error').textContent(),/azaltılmış hareket/);
  await page.evaluate(()=>window.hafiza.setMode('image'));await page.waitForFunction(()=>window.hafiza.diagnostics().amount===1&&!window.hafiza.diagnostics().transitioning);const imageBefore=await diag();await page.mouse.move(800,450);await page.mouse.down();await page.mouse.move(900,500);await page.mouse.up();await page.mouse.wheel(0,-100);const imageAfter=await diag();assert.deepEqual(imageAfter.view,imageBefore.view);assert.deepEqual(imageAfter.positions,imageBefore.positions);
  await page.evaluate(()=>window.hafiza.setMode('graph'));await page.waitForFunction(()=>window.hafiza.diagnostics().amount===0&&!window.hafiza.diagnostics().transitioning);await page.goto(base+'/?wallpaper=1');await page.waitForFunction(()=>window.hafiza?.diagnostics().settled&&window.hafiza.diagnostics().nodes>0);
  assert.equal(await page.locator('#zoom-in').isVisible(),true);assert.equal(await page.locator('#explore').isVisible(),true);assert.equal(await page.locator('#search').isVisible(),false);await page.locator('#explore').click();assert.ok(requests.some(r=>r.endpoint==='explore'&&r.token));await page.screenshot({path:path.join(out,'hermes-wallpaper.png')});
  assert.deepEqual(errors,[]);
  const report={testedAt:new Date().toISOString(),nodes:initial.nodes,edges:initial.edges,hover:true,selectionMetadataCounts:true,tokenizedOpenActionStubbed:true,neighborNavigation:true,pan:true,cursorAnchoredWheelZoom:true,visibleZoomButtons:true,resetView:true,dragOnlyOneNode:true,dragPersistedAcrossReload:true,keyboardSearch:true,unresolvedOpenDisabled:!!missing,optionalLiveWithoutPhysics:true,reducedMotionDisablesLive:true,imageIgnoresGraphGestures:true,selectionPulseStops:true,wallpaperMouseControlsAndExplore:true,errors};fs.writeFileSync(path.join(out,'browser-interaction-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();harness.close();}
})().catch(e=>{console.error(e);process.exit(1);});
