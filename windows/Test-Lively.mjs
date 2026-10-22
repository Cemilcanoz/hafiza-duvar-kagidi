import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const config=JSON.parse(await fs.readFile(path.join(root,'runtime/config.json'),'utf8'));
const browser=await chromium.connectOverCDP('http://127.0.0.1:47832');
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes(`127.0.0.1:${config.port}/`));
if(!page)throw new Error('Actual Lively WebView2 page not found');
const diagnostics=()=>page.evaluate(()=>window.hafiza.diagnostics());
const mode=async value=>{const r=await fetch(`http://127.0.0.1:${config.port}/api/mode`,{method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify({mode:value})});if(!r.ok)throw new Error(`Mode request failed ${r.status}`);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await mode('graph');
for(let i=0;i<100;i++){const d=await diagnostics();if(d.settled&&!d.transitioning)break;await sleep(300);}
const before=await diagnostics();
const snapshot=await fetch(`http://127.0.0.1:${config.port}/api/snapshot`).then(r=>r.json());
const timeOrigin=await page.evaluate(()=>performance.timeOrigin);
await page.screenshot({path:path.join(root,'runtime/acceptance/lively-real-graph.png')});
await sleep(4000);
const idle=await diagnostics();
await mode('image');await sleep(750);
const image=await diagnostics();
await page.screenshot({path:path.join(root,'runtime/acceptance/lively-real-image.png')});
await mode('graph');await sleep(750);
const returned=await diagnostics();
for(const value of ['image','graph','image','graph']){await mode(value);await sleep(65);}
await sleep(700);
const rapid=await diagnostics();
const evidence={url:page.url(),before,idle,image,returned,checks:{
  realVault:before.nodes===snapshot.nodes.length&&before.edges===snapshot.edges.length&&before.generatedAt===snapshot.generatedAt,
  idleFramesStopped:before.frames===idle.frames,
  idleWorkerStopped:before.workerMessages===idle.workerMessages,
  imageReached:image.amount===1&&!image.transitioning,
  graphReturned:returned.amount===0&&!returned.transitioning,
  samePositions:JSON.stringify(before.positions)===JSON.stringify(returned.positions),
  transitionApproximately500:image.lastTransitionMs>=490&&image.lastTransitionMs<650,
  rapidLastTargetReached:rapid.target==='graph'&&rapid.amount===0&&!rapid.transitioning,
  pageNeverReloaded:timeOrigin===await page.evaluate(()=>performance.timeOrigin)
}};
await fs.writeFile(path.join(root,'runtime/acceptance/lively-real-acceptance.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence.checks));
console.log(JSON.stringify({imageTransitionMs:image.lastTransitionMs,returnTransitionMs:returned.lastTransitionMs,frames:[before.frames,idle.frames],workerMessages:[before.workerMessages,idle.workerMessages]}));
await browser.close();
if(Object.values(evidence.checks).some(v=>!v))process.exitCode=1;
