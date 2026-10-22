'use strict';
const{chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900},reducedMotion:'reduce'}),out=path.join(__dirname,'../runtime/acceptance');
  await page.goto('http://127.0.0.1:47831');await page.waitForFunction(()=>window.hafiza?.diagnostics().nodes>0&&window.hafiza.diagnostics().settled&&window.hafiza.diagnostics().imageReady);
  await page.evaluate(()=>window.hafiza.setMode('graph'));await page.waitForFunction(()=>window.hafiza.diagnostics().amount===0&&!window.hafiza.diagnostics().rafPending);
  assert.equal(await page.locator('h1').count(),0);assert.equal(await page.locator('.masthead').count(),0);
  const before=await page.evaluate(()=>window.hafiza.diagnostics());
  const result=await page.evaluate(async()=>{
   const scene=document.getElementById('scene'),ctx=scene.getContext('2d'),w=scene.width,h=scene.height;
   const reference=new OffscreenCanvas(w,h),ref=reference.getContext('2d'),image=new Image();image.src='/api/image';await image.decode();
   const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight),iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;ref.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);
   window.__expectedPhoto=ref.getImageData(0,0,w,h).data;const original=ctx.getImageData(0,0,w,h).data,samples=[];
   window.hafiza.setMode('image');
   for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,120));const actual=ctx.getImageData(0,0,w,h).data,a=window.hafiza.diagnostics().amount;let sum=0,max=0,count=0;
    for(let p=0;p<actual.length;p+=4*137)for(let c=0;c<3;c++){const expected=Math.round(original[p+c]*(1-a)+window.__expectedPhoto[p+c]*a),difference=Math.abs(expected-actual[p+c]);sum+=difference;max=Math.max(max,difference);count++;}samples.push({amount:a,maxChannelError:max,meanChannelError:sum/count});}
   return samples;
  });
  assert.ok(result.every(s=>s.amount>0&&s.amount<1&&s.maxChannelError<=2),'Linear crossfade must match weighted opaque graph/photo pixels');
  await page.waitForFunction(()=>window.hafiza.diagnostics().amount===1&&!window.hafiza.diagnostics().transitioning);
  const png=await page.screenshot({path:path.join(out,'clean-photo.png')});
  const pixelCheck=await page.evaluate(async encoded=>{const shot=new Image();shot.src='data:image/png;base64,'+encoded;await shot.decode();const temp=new OffscreenCanvas(shot.naturalWidth,shot.naturalHeight),c=temp.getContext('2d');c.drawImage(shot,0,0);const actual=c.getImageData(0,0,temp.width,temp.height).data;let mismatch=0,max=0;for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-window.__expectedPhoto[i]);if(d)mismatch++;max=Math.max(max,d);}return{mismatchedChannels:mismatch,maxChannelError:max,totalPixels:temp.width*temp.height};},png.toString('base64'));
  assert.equal(pixelCheck.mismatchedChannels,0,'Entire screenshot must equal image-cover reference, including former toolbar areas');
  const hidden=await page.evaluate(()=>[...document.body.children].filter(e=>e.tagName!=='CANVAS'&&e.tagName!=='SCRIPT').every(e=>getComputedStyle(e).visibility==='hidden'));
  assert.equal(hidden,true);
  await page.evaluate(()=>window.hafiza.setMode('graph'));await page.waitForFunction(()=>window.hafiza.diagnostics().amount===0&&!window.hafiza.diagnostics().transitioning);const after=await page.evaluate(()=>window.hafiza.diagnostics());assert.deepEqual(after.positions,before.positions);assert.deepEqual(after.view,before.view);
  await page.screenshot({path:path.join(out,'graph-without-title.png')});
  const report={testedAt:new Date().toISOString(),titleRemoved:true,opaqueLinearCrossfadeSamples:result,photoFullScreenshotPixelCheck:pixelCheck,allPhotoChromeHidden:true,returnPreservesCoordinatesAndZoom:true};fs.writeFileSync(path.join(out,'photo-transition-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
