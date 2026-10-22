'use strict';
async function evaluate(expression, port=9223, title='CemoOS') {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = pages.find(p => p.type === 'page' && p.url.startsWith('app://obsidian.md/') && p.title.includes(title));
  if (!page) throw new Error('Obsidian page not available');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j) => { ws.onopen=r; ws.onerror=j; });
  return new Promise((resolve,reject) => {
    const timer=setTimeout(() => {ws.close();reject(new Error('CDP timed out'));},30000);
    ws.onmessage = e => {
      const message=JSON.parse(e.data);
      if(message.id!==1)return;
      clearTimeout(timer);ws.close();
      if(message.result?.exceptionDetails)reject(new Error(JSON.stringify(message.result.exceptionDetails)));
      else resolve(message.result?.result?.value);
    };
    ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
  });
}
module.exports={evaluate};
if(require.main===module) evaluate(process.argv[2],Number(process.argv[3])||9223,process.argv[4]||'CemoOS').then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e);process.exit(1);});
