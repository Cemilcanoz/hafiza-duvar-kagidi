'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
module.exports=async function startBridge(port=47840,appearanceOverride={}){
 const root=path.join(__dirname,'..'),source=path.join(root,'runtime'),runtime=fs.mkdtempSync(path.join(source,'browser-test-'));
 const config={...JSON.parse(fs.readFileSync(path.join(source,'config.json'))),port};fs.writeFileSync(path.join(runtime,'config.json'),JSON.stringify(config));
 for(const name of ['snapshot.json','wallpaper'])if(fs.existsSync(path.join(source,name)))fs.copyFileSync(path.join(source,name),path.join(runtime,name));
 const current=await fetch('http://127.0.0.1:47831/api/state').then(r=>r.json());
 fs.writeFileSync(path.join(runtime,'state.json'),JSON.stringify({mode:'graph'}));fs.writeFileSync(path.join(runtime,'appearance.json'),JSON.stringify({...current.appearance,...appearanceOverride}));
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,HAFIZA_RUNTIME:runtime},windowsHide:true,stdio:['ignore','pipe','pipe']});const base=`http://127.0.0.1:${port}`;
 for(let i=0;i<60;i++){try{if((await fetch(base+'/api/state')).ok)return{base,config,runtime,close:()=>{if(child.exitCode===null)child.kill();}};}catch{}await new Promise(r=>setTimeout(r,100));}
 child.kill();throw Error('Isolated browser test bridge did not start');
};
