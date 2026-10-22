import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),cfg=JSON.parse(await fs.readFile(path.join(root,'runtime/config.json'),'utf8'));
const browser=await chromium.connectOverCDP('http://127.0.0.1:47832');
try{
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/?wallpaper=1'));
 const before=await page.evaluate(()=>window.hafiza.diagnostics());
 const mode=async mode=>{const response=await fetch(`http://127.0.0.1:${cfg.port}/api/mode`,{method:'POST',headers:{Authorization:`Bearer ${cfg.token}`,'Content-Type':'application/json'},body:JSON.stringify({mode})});if(!response.ok)throw new Error('mode '+response.status);await new Promise(r=>setTimeout(r,750));};
 await mode('image');
 const photo=await page.evaluate(()=>({diagnostics:window.hafiza.diagnostics(),visibleChrome:[...document.querySelectorAll('.telemetry,#controls,#selection,.legend,#tooltip')].filter(el=>{const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0;}).map(e=>e.id||e.className),titleBanner:!!document.querySelector('.masthead')}));
 await page.screenshot({path:path.join(root,'runtime/acceptance/lively-final-clean-photo.png')});
 await mode('graph');const returned=await page.evaluate(()=>window.hafiza.diagnostics());
 const result={before,photo,returned,checks:{photoComplete:photo.diagnostics.amount===1&&!photo.diagnostics.transitioning,noChrome:photo.visibleChrome.length===0,noBanner:!photo.titleBanner,samePositions:JSON.stringify(before.positions)===JSON.stringify(returned.positions),sameView:JSON.stringify(before.view)===JSON.stringify(returned.view)}};
 await fs.writeFile(path.join(root,'runtime/acceptance/lively-final-photo-acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result.checks));
}finally{await browser.close();}
