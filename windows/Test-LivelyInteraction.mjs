import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.connectOverCDP('http://127.0.0.1:47832');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/?wallpaper=1'));
  if(!page)throw new Error('Actual Lively WebView2 page not found');
  const d=()=>page.evaluate(()=>window.hafiza.diagnostics());
  await page.waitForFunction(()=>window.hafiza?.diagnostics().settled);
  await page.locator('#reset-view').click();
  await sleep(300);
  const before=await d();
  const origin=await page.evaluate(()=>performance.timeOrigin);
  await page.locator('#zoom-in').click();
  const zoomed=await d();
  await page.locator('#reset-view').click();
  let points=await page.evaluate(()=>window.hafiza.interactionPoints());
  const node=points.filter(n=>!n.unresolved&&n.degree>0&&n.x>550&&n.x<1300&&n.y>240&&n.y<820).sort((a,b)=>b.degree-a.degree)[0];
  if(!node)throw new Error('No safe graph node coordinate');
  await page.mouse.click(node.x,node.y);
  const selected=await d();
  await page.screenshot({path:path.join(root,'runtime/acceptance/lively-interactive-selection.png')});
  // Pan from a free area of the actual canvas. This is engine input, not OS routing proof.
  const empty=Array.from({length:8},(_,i)=>({x:550+i*90,y:850})).find(p=>points.every(n=>Math.hypot(n.x-p.x,n.y-p.y)>30));
  if(!empty)throw new Error('No empty canvas point');
  await page.mouse.move(empty.x,empty.y);await page.mouse.down();
  await page.mouse.move(empty.x+90,empty.y-35,{steps:8});await page.mouse.up();
  const panned=await d();
  await page.locator('#reset-view').click();
  await page.locator('#close-selection').click();
  await page.mouse.move(1700,900);
  await sleep(1800);
  const idleStart=await d();await sleep(3000);const idleEnd=await d();
  await page.screenshot({path:path.join(root,'runtime/acceptance/lively-interactive-atlas.png')});
  const evidence={scope:'Actual Lively WebView2 CDP handlers; Windows desktop routing requires separate manual input evidence.',before,zoomed,selected,panned,idleStart,idleEnd,checks:{
    zoomButton:zoomed.view.zoom>before.view.zoom,
    nodeSelection:selected.selectedNode===node.id,
    selectionPanel:await page.locator('#selection').isHidden(),
    pan:panned.pans>selected.pans&&Math.abs(panned.view.offsetX)>60,
    idleDrawingStopped:idleStart.frames===idleEnd.frames&&!idleEnd.rafPending,
    idlePhysicsStopped:idleStart.workerMessages===idleEnd.workerMessages,
    pageNeverReloaded:origin===await page.evaluate(()=>performance.timeOrigin),
    wallpaperToolbarVisible:await page.locator('#zoom-in').isVisible()&&await page.locator('#explore').isVisible()
  }};
  await fs.writeFile(path.join(root,'runtime/acceptance/lively-interaction-acceptance.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence.checks));
  console.log(JSON.stringify({nodes:before.nodes,edges:before.edges,selected:node.id,viewBefore:before.view,zoomed:zoomed.view,panned:panned.view,idleFrames:[idleStart.frames,idleEnd.frames],idleWorker:[idleStart.workerMessages,idleEnd.workerMessages]}));
  if(Object.values(evidence.checks).some(v=>!v))process.exitCode=1;
}finally {await browser.close();}
