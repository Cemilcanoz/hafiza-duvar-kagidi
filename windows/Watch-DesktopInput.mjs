// Connect only to the temporary diagnostic port of the actual Lively WebView.
// --arm clears the test phase; subsequent user mouse actions can be read with --read.
// CDP-generated mouse input must not be sent after arming a manual-test phase.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.connectOverCDP('http://127.0.0.1:47832');
try {
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/?wallpaper=1'));
  if(!page)throw new Error('Actual Lively wallpaper page not found');
  if(process.argv.includes('--refresh')){
    await page.reload();
    await page.waitForFunction(()=>window.hafiza?.diagnostics().nodes>0&&window.hafiza.diagnostics().settled);
  }
  if(process.argv.includes('--arm')) await page.evaluate(()=>{
    if(!window.__hafizaNativeListener){
      window.__hafizaNativeListener=true;
      for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','wheel'])
        document.addEventListener(type,event=>{
          const store=window.__hafizaNativeInput;
          if(store)store.events.push({type,x:event.clientX,y:event.clientY,button:event.button,buttons:event.buttons,isTrusted:event.isTrusted,time:Date.now(),target:event.target?.id||event.target?.tagName});
        },{capture:true,passive:true});
    }
    window.hafiza?.resetInteractionCounters();
    window.__hafizaNativeInput={armedAt:new Date().toISOString(),events:[],baseline:window.hafiza?.diagnostics()};
  });
  const result=await page.evaluate(()=>({url:location.href,input:window.__hafizaNativeInput||null,diagnostics:window.hafiza?.diagnostics()}));
  await fs.writeFile(path.join(root,'runtime/acceptance/lively-desktop-manual-input.json'),JSON.stringify(result,null,2));
  const d=result.diagnostics;
  console.log(JSON.stringify({armedAt:result.input?.armedAt,events:result.input?.events,nodes:d?.nodes,edges:d?.edges,selectedNode:d?.selectedNode,view:d?.view,pointerDowns:d?.pointerDowns,pointerMoves:d?.pointerMoves,pans:d?.pans,nodeDrags:d?.nodeDrags,zooms:d?.zooms,live:d?.live,rafPending:d?.rafPending}));
} finally {await browser.close();}
