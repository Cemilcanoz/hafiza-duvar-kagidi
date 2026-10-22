import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.connectOverCDP('http://127.0.0.1:47832');
try {
  const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/?wallpaper=1'));
  const result=await page.evaluate(()=>{
    const points=window.hafiza.interactionPoints(),rect=document.querySelector('#scene').getBoundingClientRect();
    const events=window.__hafizaNativeInput?.events.filter(e=>e.type==='click')||[];
    return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,canvas:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},events:events.map(e=>({...e,nearest:points.map(n=>({id:n.id,x:n.x,y:n.y,distance:Math.hypot(n.x-e.x,n.y-e.y)})).sort((a,b)=>a.distance-b.distance).slice(0,1)}))};
  });
  await fs.writeFile(path.join(root,'runtime/acceptance/lively-native-coordinate-inspection.json'),JSON.stringify(result,null,2));
  await page.screenshot({path:path.join(root,'runtime/acceptance/lively-after-manual.png')});
  console.log(JSON.stringify(result));
}finally {await browser.close();}
