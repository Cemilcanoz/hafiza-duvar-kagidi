'use strict';
const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const ROOT=__dirname, RUNTIME=process.env.HAFIZA_RUNTIME||path.join(ROOT,'runtime');
fs.mkdirSync(RUNTIME,{recursive:true});
const configPath=path.join(RUNTIME,'config.json');
const config=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,'utf8')):{port:47831,token:crypto.randomBytes(32).toString('hex'),hotkey:{modifiers:['Control','Alt'],key:'G'}};
if(!fs.existsSync(configPath))fs.writeFileSync(configPath,JSON.stringify(config,null,2));
function read(name,fallback){try{return JSON.parse(fs.readFileSync(path.join(RUNTIME,name),'utf8'));}catch{return fallback;}}
function save(name,value){const p=path.join(RUNTIME,name);fs.writeFileSync(p+'.tmp',JSON.stringify(value));fs.renameSync(p+'.tmp',p);}
function validateSnapshot(x){
 if(!x||x.schema!==1||!Array.isArray(x.nodes)||!Array.isArray(x.edges)||x.nodes.length>100000||x.edges.length>1000000)throw Error('Invalid snapshot');
 const ids=new Set();const nodes=x.nodes.map(n=>{if(typeof n.id!=='string'||!n.id||n.id.length>4096||ids.has(n.id)||typeof n.label!=='string')throw Error('Invalid node');ids.add(n.id);return {id:n.id,label:n.label.slice(0,4096),...(n.unresolved?{unresolved:true}:{})};});
 const edges=x.edges.map(e=>{if(!ids.has(e.source)||!ids.has(e.target)||!Number.isSafeInteger(e.count)||e.count<1)throw Error('Invalid edge');return {source:e.source,target:e.target,count:e.count};});
 return {schema:1,generatedAt:new Date(x.generatedAt).toISOString(),receivedAt:new Date().toISOString(),nodes,edges};
}
const defaultAppearance={background:'#153cdb',motion:'organic',style:'glow',live:true,folderColors:{},nodeColors:{}};
function validateAppearance(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid appearance');
 const color=x=>typeof x==='string'&&/^#[a-f\d]{6}$/i.test(x);
 if(!color(value.background)||!['organic','flow','still'].includes(value.motion)||!['glow','ink','orbit'].includes(value.style)||typeof value.live!=='boolean')throw Error('Invalid appearance settings');
 function colors(map){if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>20000)throw Error('Invalid color map');const out=Object.create(null);for(const [id,hex]of Object.entries(map)){if(!id||id.length>4096||id==='__proto__'||id==='constructor'||!color(hex))throw Error('Invalid color override');out[id]=hex.toLowerCase();}return out;}
 return{background:value.background.toLowerCase(),motion:value.motion,style:value.style,live:value.live,folderColors:colors(value.folderColors),nodeColors:colors(value.nodeColors)};
}
let appearance;try{appearance=validateAppearance(read('appearance.json',defaultAppearance));}catch{appearance=validateAppearance(defaultAppearance);}
let snapshot=read('snapshot.json',null),state=read('state.json',{mode:'graph'}),clients=new Set(),wallpaperClients=0;
const modeState=()=>({mode:state.mode,wallpaperActive:wallpaperClients>0});
function emit(event,data){for(const res of clients)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}
function body(req,limit){return new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',b=>{size+=b.length;if(size>limit){reject(Error('Too large'));req.destroy();}else chunks.push(b);});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
function launchUri(uri){return new Promise((resolve,reject)=>{const obsidianExe=config.obsidianExe||path.join(process.env.LOCALAPPDATA||'','Programs','Obsidian','Obsidian.exe');const direct=uri.startsWith('obsidian://')&&fs.existsSync(obsidianExe);const child=spawn(direct?obsidianExe:'rundll32.exe',direct?[uri]:['url.dll,FileProtocolHandler',uri],{windowsHide:true,detached:true,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});}
function createServer(options={}){const openUri=options.openUri||launchUri;return http.createServer(async(req,res)=>{
 const origin=`http://127.0.0.1:${config.port}`;
 const send=(status,data,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type==='application/json'?JSON.stringify(data):data);};
 if(req.headers.host!==`127.0.0.1:${config.port}`&&req.headers.host!==`localhost:${config.port}`)return send(403,{error:'Host denied'});
 if(req.headers.origin&&req.headers.origin!==origin&&req.headers.origin!==`http://localhost:${config.port}`&&req.headers.origin!=='app://obsidian.md')return send(403,{error:'Origin denied'});
 const pathname=new URL(req.url,origin).pathname;
 try{
 if(req.method==='POST'){
 const token=req.headers.authorization?.replace(/^Bearer /,'')||req.headers['x-control-token'];
 if(token!==config.token)return send(401,{error:'Unauthorized'});
 if(pathname==='/api/appearance'){const next=validateAppearance(JSON.parse(await body(req,2*1024*1024)));save('appearance.json',next);appearance=next;emit('appearance',appearance);return send(200,appearance);}
 if(pathname==='/api/gesture'){
 const gesture=JSON.parse(await body(req,2048));
 if(!Number.isFinite(gesture.factor)||gesture.factor<.5||gesture.factor>2||!Number.isFinite(gesture.xRatio)||!Number.isFinite(gesture.yRatio)||gesture.xRatio<0||gesture.xRatio>1||gesture.yRatio<0||gesture.yRatio>1)return send(400,{error:'Invalid zoom gesture'});
 if(state.mode!=='graph')return send(409,{error:'Graph mode required'});
 emit('zoom',{factor:gesture.factor,xRatio:gesture.xRatio,yRatio:gesture.yRatio});return send(200,{ok:true});}
 if(pathname==='/api/open'){
 const {id}=JSON.parse(await body(req,8192));const node=snapshot?.nodes.find(n=>n.id===id);
 if(!node)return send(404,{error:'Note not in current graph'});
 if(node.unresolved)return send(409,{error:'This note does not exist yet'});
 // The only native action is a fixed Obsidian scheme, with encoded metadata IDs.
 const uri='obsidian://open?vault='+encodeURIComponent(config.vaultName||'CemoOS')+'&file='+encodeURIComponent(node.id);
 await openUri(uri);return send(200,{ok:true});}
 if(pathname==='/api/explore'){await openUri(origin+'/?explore=1');return send(200,{ok:true});}
 if(pathname==='/api/snapshot'){snapshot=validateSnapshot(JSON.parse(await body(req,32*1024*1024)));save('snapshot.json',snapshot);emit('snapshot',snapshot);return send(200,{nodes:snapshot.nodes.length,edges:snapshot.edges.length});}
 if(pathname==='/api/mode'||pathname==='/api/toggle'){
 const next=pathname==='/api/toggle'?(state.mode==='graph'?'image':'graph'):JSON.parse(await body(req,2048)).mode;
 if(!['graph','image'].includes(next))return send(400,{error:'Invalid mode'});
 if(next==='image'&&!fs.existsSync(path.join(RUNTIME,'wallpaper')))return send(409,{error:'Image unavailable'});
 state.mode=next;save('state.json',state);emit('mode',modeState());return send(200,{mode:next});}
 if(pathname==='/api/image'){
 const bytes=await body(req,32*1024*1024);if(!/^image\/(jpeg|png|webp)$/.test(req.headers['content-type']||''))return send(415,{error:'JPEG, PNG or WebP required'});
 const valid=bytes.subarray(0,3).equals(Buffer.from([255,216,255]))||bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');
 if(!valid)return send(415,{error:'Invalid image signature'});
 fs.writeFileSync(path.join(RUNTIME,'wallpaper.tmp'),bytes);fs.renameSync(path.join(RUNTIME,'wallpaper.tmp'),path.join(RUNTIME,'wallpaper'));state.imageType=req.headers['content-type'];save('state.json',state);emit('image',{imageUrl:'/api/image?v='+Date.now()});return send(200,{ok:true});}
 return send(404,{error:'Unknown endpoint'});
 }
 if(req.method!=='GET')return send(405,{error:'Method denied'});
 if(pathname==='/api/state')return send(200,{...state,...modeState(),appearance,duration:500,imageUrl:'/api/image',token:config.token,hotkey:[...config.hotkey.modifiers,config.hotkey.key].join('+'),snapshotAvailable:!!snapshot});
 if(pathname==='/api/snapshot')return send(200,snapshot||{schema:1,generatedAt:null,nodes:[],edges:[]});
 if(pathname==='/api/image'){const p=path.join(RUNTIME,'wallpaper');if(!fs.existsSync(p))return send(404,{error:'Image unavailable'});const bytes=fs.readFileSync(p);const mime=bytes[0]===137?'image/png':bytes.toString('ascii',0,4)==='RIFF'?'image/webp':'image/jpeg';return send(200,bytes,mime);}
 if(pathname==='/api/events'){
 const wallpaper=new URL(req.url,origin).searchParams.get('client')==='wallpaper';if(wallpaper){wallpaperClients++;emit('mode',modeState());}
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`event: mode\ndata: ${JSON.stringify(modeState())}\n\n`);res.write(`event: appearance\ndata: ${JSON.stringify(appearance)}\n\n`);if(snapshot)res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);clients.add(res);req.on('close',()=>{clients.delete(res);if(wallpaper){wallpaperClients--;emit('mode',modeState());}});return;}
 const relative=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));const file=path.resolve(ROOT,'web',relative);const base=path.join(ROOT,'web')+path.sep;
 if(!file.startsWith(base)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,{error:'Not found'});
 return send(200,fs.readFileSync(file),types[path.extname(file)]||'application/octet-stream');
 }catch(e){return send(400,{error:e.message});}
 });}
if(require.main===module){const server=createServer();server.listen(config.port,'127.0.0.1',()=>console.log(`Hafiza http://127.0.0.1:${config.port}`));server.on('error',e=>{console.error(e.message);process.exitCode=1;});}
module.exports={validateSnapshot,validateAppearance,createServer,config};
