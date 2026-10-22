'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900}});await page.goto('http://127.0.0.1:47831');
  await page.waitForFunction(()=>window.hafiza?.diagnostics().nodes>0&&window.hafiza.diagnostics().settled&&window.hafiza.diagnostics().imageReady);
  const browserSession=await browser.newBrowserCDPSession(),pageSession=await page.context().newCDPSession(page);await pageSession.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await pageSession.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
  const cpu=async()=>new Map((await browserSession.send('SystemInfo.getProcessInfo')).processInfo.map(p=>[p.id,{type:p.type,time:p.cpuTime}]));
  const results=[];
  for(const mode of ['graph','image']){
   await page.evaluate(mode=>window.hafiza.setMode(mode),mode);await page.waitForFunction(mode=>!window.hafiza.diagnostics().transitioning&&window.hafiza.diagnostics().amount===(mode==='image'?1:0),mode);
   const beforeMetrics=await metrics(),beforeCpu=await cpu(),before=await page.evaluate(()=>window.hafiza.diagnostics());const started=performance.now();
   await page.waitForTimeout(5000);
   const seconds=(performance.now()-started)/1000,afterCpu=await cpu(),afterMetrics=await metrics(),after=await page.evaluate(()=>window.hafiza.diagnostics());
   let cpuSeconds=0;const processes=[];for(const[id,p]of afterCpu){const delta=Math.max(0,p.time-(beforeCpu.get(id)?.time??p.time));cpuSeconds+=delta;processes.push({type:p.type,cpuSeconds:delta});}
   results.push({mode,sampleSeconds:seconds,edgeAllProcessesCpuSeconds:cpuSeconds,cpuPercentOfOneLogicalCore:100*cpuSeconds/seconds,pageTaskSeconds:afterMetrics.TaskDuration-beforeMetrics.TaskDuration,jsHeapBytes:afterMetrics.JSHeapUsedSize,frames:after.frames-before.frames,workerMessages:after.workerMessages-before.workerMessages,processes});
  }
  const report={testedAt:new Date().toISOString(),environment:'Microsoft Edge headless, 1600x900, Windows. Includes automation overhead; this does not measure Lively GPU/working set.',results};
  fs.writeFileSync(path.join(__dirname,'../runtime/acceptance/browser-resource-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
