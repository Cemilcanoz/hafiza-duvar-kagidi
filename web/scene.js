'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas=$('scene'),ctx=canvas.getContext('2d',{alpha:false});
  const graphCanvas=document.createElement('canvas'),g=graphCanvas.getContext('2d');
  const status=$('status'),error=$('error'),toggle=$('toggle'),tooltip=$('tooltip');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  if(new URLSearchParams(location.search).has('wallpaper'))document.body.classList.add('wallpaper');
  let nodes=[],edges=[],byId=new Map(),generation=0,signature='',graphDirty=true,fitting=true;
  let image=null,target='graph',amount=0,transition=null,raf=0,width=0,height=0,dpr=1;
  let token='',duration=500,generatedAt='',imageRevision=0,settled=false,imagePending=false;
  let cachedPositions={},selectedId=null,hoverId=null,drag=null,pulse=null,live=true,liveTimer=null;
  let appearance={background:'#153cdb',motion:'organic',style:'glow',live:true,folderColors:{},nodeColors:{}},sceneInk='#f5efd9',visualTime=0,appearanceQueue=Promise.resolve(),pendingAppearanceWrites=0,appearanceVersion=0,lastAppearanceError=null;
  let results=[],resultIndex=0,suppressClickUntil=0,hostPaused=false;
  const camera={zoom:1,offsetX:0,offsetY:0};
  let fit={scale:1,x:0,y:0,cx:0,cy:0};
  const stats={frames:0,graphRenders:0,workerMessages:0,settles:0,transitionStarts:0,transitionEnds:0,lastTransitionMs:0,pointerDowns:0,pointerMoves:0,pointerCancels:0,clicks:0,pans:0,nodeDrags:0,selections:0,zooms:0};
  try{cachedPositions=JSON.parse(localStorage.getItem('hafiza.positions.v1')||'{}');}catch{}
  const worker=new Worker('/layout-worker.js');
  const hash=s=>{let h=2166136261;for(const ch of s)h=Math.imul(h^ch.charCodeAt(0),16777619);return(h>>>0)/4294967296;};
  const displayLabel=n=>/^[a-f\d]{64}$/i.test(n.label||'')?'Kayıt · '+n.label.slice(0,8):(n.label||n.id);
  const effectiveLive=()=>appearance.live&&!reducedMotion.matches&&appearance.motion!=='still';
  const screen=n=>{const animated=effectiveLive()&&appearance.motion==='organic',phase=hash(n.id)*Math.PI*2,t=visualTime/1000,amplitude=n.id===selectedId||n.id===hoverId?1.5:4;return{x:fit.cx+(n.x-fit.x)*fit.scale*camera.zoom+camera.offsetX+(animated?Math.sin(t*.27+phase)*amplitude:0),y:fit.cy+(n.y-fit.y)*fit.scale*camera.zoom+camera.offsetY+(animated?Math.cos(t*.23+phase*1.37)*amplitude:0)};};
  const world=(x,y)=>({x:fit.x+(x-fit.cx-camera.offsetX)/(fit.scale*camera.zoom),y:fit.y+(y-fit.cy-camera.offsetY)/(fit.scale*camera.zoom)});
  function requestDraw(){if(!raf&&!document.hidden&&!hostPaused)raf=requestAnimationFrame(draw);}
  function invalidate(){graphDirty=true;requestDraw();}
  function contrastingInk(background){const rgb=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.39?'#16204a':'#f5efd9';}
  function nodeColor(n){if(appearance.nodeColors[n.id])return appearance.nodeColors[n.id];const folder=Object.keys(appearance.folderColors).filter(p=>n.id.startsWith(p+'/')).sort((a,b)=>b.length-a.length)[0];return folder?appearance.folderColors[folder]:sceneInk;}
  function makeSwatches(id,colors,action){$(id).replaceChildren();for(const color of colors){const button=document.createElement('button');button.type='button';button.className='swatch';button.dataset.color=color;button.setAttribute('aria-label',color+' rengini seç');button.setAttribute('aria-pressed','false');button.style.setProperty('--swatch',color);button.onclick=()=>action(color);$(id).append(button);}}
  const palette=['#f5efd9','#ffd378','#ff8f91','#91d8ca','#88b6ff','#d9a4f8','#16204a'];
  function refreshAppearanceControls(){
    $('background-color').value=appearance.background;$('background-value').textContent=appearance.background;$('motion-select').value=appearance.motion;$('style-select').value=appearance.style;
    const folder=$('folder-select').value;$('folder-color').value=appearance.folderColors[folder]||sceneInk;$('reset-folder-color').disabled=!appearance.folderColors[folder];
    const n=byId.get(selectedId);if(n){$('node-color').value=nodeColor(n);$('reset-node-color').disabled=!appearance.nodeColors[n.id];}
    for(const [id,color]of [['background-swatches',appearance.background],['folder-swatches',appearance.folderColors[folder]],['node-swatches',n?appearance.nodeColors[n.id]:null]])for(const button of $(id).children)button.setAttribute('aria-pressed',String(button.dataset.color===color));
    $('live').setAttribute('aria-pressed',String(appearance.live));
  }
  function refreshFolders(){const previous=$('folder-select').value,folders=new Set();for(const n of nodes.filter(n=>!n.unresolved)){const parts=n.id.split('/');for(let i=1;i<parts.length;i++)folders.add(parts.slice(0,i).join('/'));}$('folder-select').replaceChildren();for(const folder of [...folders].sort((a,b)=>a.localeCompare(b,'tr'))){const option=document.createElement('option');option.value=folder;option.textContent=folder;$('folder-select').append(option);}if(folders.has(previous))$('folder-select').value=previous;refreshAppearanceControls();}
  function applyAppearance(value){if(!value||!/^#[a-f\d]{6}$/i.test(value.background||''))return;appearance={...appearance,...value,folderColors:{...(value.folderColors||{})},nodeColors:{...(value.nodeColors||{})}};live=appearance.live&&!reducedMotion.matches&&appearance.motion!=='still';sceneInk=contrastingInk(appearance.background);document.body.style.color=sceneInk;document.documentElement.style.setProperty('--scene-ink',sceneInk);document.documentElement.style.setProperty('--scene-background',appearance.background);refreshAppearanceControls();scheduleLive();invalidate();}
  function saveAppearance(patch){
    const next={...appearance,...patch,folderColors:{...(patch.folderColors||appearance.folderColors)},nodeColors:{...(patch.nodeColors||appearance.nodeColors)}};applyAppearance(next);pendingAppearanceWrites++;appearanceVersion++;$('appearance-status').textContent='Kaydediliyor…';
    appearanceQueue=appearanceQueue.then(()=>post('/api/appearance',next)).then(()=>{lastAppearanceError=null;}).catch(e=>{lastAppearanceError=e;error.textContent=e.message;}).finally(async()=>{
      pendingAppearanceWrites--;if(pendingAppearanceWrites)return;const version=appearanceVersion;
      // A concurrent client can update appearance while our serialized writes run.
      // Read the authoritative final value instead of losing an ignored pending SSE.
      try{const response=await fetch('/api/state');if(response.ok){const state=await response.json();if(version===appearanceVersion&&!pendingAppearanceWrites&&state.appearance)applyAppearance(state.appearance);}}catch{}
      if(version===appearanceVersion&&!pendingAppearanceWrites)$('appearance-status').textContent=lastAppearanceError?'Kaydedilemedi; yerel köprüyü kontrol et.':'Ayarlar kaydedildi.';
    });return appearanceQueue;
  }
  function changeNodeColor(color){if(!selectedId)return;const colors={...appearance.nodeColors};if(color)colors[selectedId]=color;else delete colors[selectedId];saveAppearance({nodeColors:colors});}
  function changeFolderColor(color){const folder=$('folder-select').value;if(!folder)return;const colors={...appearance.folderColors};if(color)colors[folder]=color;else delete colors[folder];saveAppearance({folderColors:colors});}
  makeSwatches('background-swatches',['#153cdb','#0d1831','#163b36','#35213d','#eee8d7','#17191e'],color=>saveAppearance({background:color}));
  makeSwatches('node-swatches',palette,changeNodeColor);makeSwatches('folder-swatches',palette,changeFolderColor);
  $('appearance-toggle').onclick=()=>{const panel=$('appearance-panel');panel.hidden=!panel.hidden;$('appearance-toggle').setAttribute('aria-expanded',String(!panel.hidden));};$('close-appearance').onclick=()=>{$('appearance-panel').hidden=true;$('appearance-toggle').setAttribute('aria-expanded','false');};
  $('background-color').onchange=e=>saveAppearance({background:e.target.value});$('node-color').onchange=e=>changeNodeColor(e.target.value);$('folder-color').onchange=e=>changeFolderColor(e.target.value);$('reset-node-color').onclick=()=>changeNodeColor(null);$('reset-folder-color').onclick=()=>changeFolderColor(null);$('folder-select').onchange=refreshAppearanceControls;$('motion-select').onchange=e=>saveAppearance({motion:e.target.value});$('style-select').onchange=e=>saveAppearance({style:e.target.value});
  function savePositions(){
    cachedPositions=Object.fromEntries(nodes.map(n=>[n.id,[n.x,n.y]]));
    try{localStorage.setItem('hafiza.positions.v1',JSON.stringify(cachedPositions));localStorage.setItem('hafiza.signature.v1',signature);}catch{}
  }
  function applySnapshot(snapshot){
    if(!snapshot||snapshot.schema!==1||!Array.isArray(snapshot.nodes)||!Array.isArray(snapshot.edges))return;
    generatedAt=snapshot.generatedAt||'';
    $('node-count').textContent=snapshot.nodes.length.toLocaleString('tr');$('edge-count').textContent=snapshot.edges.length.toLocaleString('tr');
    status.textContent=`${generatedAt?new Date(generatedAt).toLocaleString('tr-TR'):'Son kayıt'} · OBSIDIAN METADATA`;
    const nextSignature=JSON.stringify([snapshot.nodes.map(n=>[n.id,n.label,n.unresolved]),snapshot.edges.map(e=>[e.source,e.target,e.count])]);
    if(signature===nextSignature)return;
    cancelDrag();hoverId=null;hideTooltip();const previous=byId;signature=nextSignature;
    nodes=snapshot.nodes.map(n=>{const old=previous.get(n.id),p=cachedPositions[n.id],angle=hash(n.id)*Math.PI*2,r=Math.sqrt(hash(n.id+'r'))*Math.sqrt(snapshot.nodes.length)*15;return{...n,x:old?.x??p?.[0]??Math.cos(angle)*r,y:old?.y??p?.[1]??Math.sin(angle)*r,degree:0};});
    byId=new Map(nodes.map(n=>[n.id,n]));
    edges=snapshot.edges.filter(e=>byId.has(e.source)&&byId.has(e.target)).map(e=>{byId.get(e.source).degree++;byId.get(e.target).degree++;return{...e,a:byId.get(e.source),b:byId.get(e.target)};});
    generation++;worker.postMessage({type:'pause'});fitting=true;
    let cachedSignature;try{cachedSignature=localStorage.getItem('hafiza.signature.v1');}catch{}
    settled=!nodes.length||(nodes.every(n=>Array.isArray(cachedPositions[n.id])&&cachedPositions[n.id].every(Number.isFinite))&&cachedSignature===signature);
    if(!settled&&nodes.length)worker.postMessage({type:'start',generation,nodes:nodes.map(n=>({id:n.id,x:n.x,y:n.y})),edges:edges.map(e=>({source:e.source,target:e.target})),warm:previous.size>0});
    if(document.hidden||hostPaused)worker.postMessage({type:'pause'});
    if(selectedId&&!byId.has(selectedId))selectNode(null);else if(selectedId)renderSelection();refreshFolders();
    invalidate();
  }
  function updateFit(){
    if(!fitting)return;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const n of nodes){minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);}
    if(!nodes.length){minX=minY=-100;maxX=maxY=100;}
    const availableWidth=width>1000?width-360:width-100,availableHeight=height-210;
    fit={scale:Math.max(.03,Math.min(availableWidth/Math.max(100,maxX-minX),availableHeight/Math.max(100,maxY-minY),1.8)),x:(minX+maxX)/2,y:(minY+maxY)/2,cx:width>1000?width*.59:width*.55,cy:height*.48};
    if(settled)fitting=false;
  }
  function neighborhood(id){const set=new Set(id?[id]:[]);if(id)for(const e of edges)if(e.source===id||e.target===id){set.add(e.source);set.add(e.target);}return set;}
  function instrument(){
    const cx=width*.59,cy=height*.48,r=Math.min(height*.4,width*.31);
    g.save();g.strokeStyle=sceneInk;g.lineWidth=.7;g.globalAlpha=.12;
    for(const radius of [r,r+10,r*.64]){g.beginPath();g.arc(cx,cy,radius,0,Math.PI*2);g.stroke();}
    g.beginPath();g.ellipse(cx,cy,r*1.2,r*.34,-.4,0,Math.PI*2);g.stroke();
    g.globalAlpha=.24;
    for(let i=0;i<96;i++){const a=i*Math.PI/48,long=i%8===0;g.beginPath();g.moveTo(cx+Math.cos(a)*(r+17),cy+Math.sin(a)*(r+17));g.lineTo(cx+Math.cos(a)*(r+(long?26:21)),cy+Math.sin(a)*(r+(long?26:21)));g.stroke();}
    g.globalAlpha=.16;g.beginPath();g.moveTo(cx-r-40,cy);g.lineTo(cx+r+40,cy);g.moveTo(cx,cy-r-35);g.lineTo(cx,cy+r+35);g.stroke();
    g.font='8px "Segoe UI",sans-serif';g.fillStyle=sceneInk;g.globalAlpha=.5;g.fillText('N / BAĞLANTI ALANI',cx+12,cy-r-38);g.fillText('SONLU NOKTALAR · AÇIK OLASILIKLAR',cx+r*.3,cy+r+45);
    // A small scale bar describes the actual navigable graph viewport.
    g.globalAlpha=.65;g.fillText(`${Math.round(camera.zoom*100)}%`,width-90,height-130);g.globalAlpha=.35;g.beginPath();g.moveTo(width-100,height-118);g.lineTo(width-46,height-118);g.moveTo(width-100,height-122);g.lineTo(width-100,height-114);g.moveTo(width-46,height-122);g.lineTo(width-46,height-114);g.stroke();g.restore();
  }
  function renderGraph(){
    graphDirty=false;stats.graphRenders++;updateFit();
    g.setTransform(dpr,0,0,dpr,0,0);g.fillStyle=appearance.background;g.fillRect(0,0,width,height);instrument();
    const focus=hoverId||selectedId,near=neighborhood(focus);
    g.strokeStyle=sceneInk;g.lineWidth=appearance.style==='ink'?1:.7;
    g.globalAlpha=focus?.045:.23;g.beginPath();
    for(const e of edges){const a=screen(e.a),b=screen(e.b);g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);}g.stroke();
    if(focus){g.globalAlpha=.72;g.lineWidth=1.15;g.beginPath();for(const e of edges)if(e.source===focus||e.target===focus){const a=screen(e.a),b=screen(e.b);g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);}g.stroke();}
    for(const n of nodes){const p=screen(n),active=near.has(n.id),r=n.unresolved?2.3:Math.min(6,2.5+Math.sqrt(n.degree)*.34);if(p.x<-20||p.x>width+20||p.y<-20||p.y>height+20)continue;
      const color=nodeColor(n);g.globalAlpha=focus?(active?1:.2):(n.unresolved?.5:.93);
      if(appearance.style==='glow'){const haloRadius=r*(n.degree>10?5:3.4),halo=g.createRadialGradient(p.x,p.y,r*.4,p.x,p.y,haloRadius);halo.addColorStop(0,color+'75');halo.addColorStop(1,color+'00');g.fillStyle=halo;g.beginPath();g.arc(p.x,p.y,haloRadius,0,Math.PI*2);g.fill();}
      g.fillStyle=color;g.beginPath();g.arc(p.x,p.y,appearance.style==='ink'?r*1.15:r,0,Math.PI*2);g.fill();
      if(n.id===focus){g.lineWidth=.8;g.globalAlpha=.7;g.beginPath();g.arc(p.x,p.y,r+7,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(p.x-13,p.y);g.lineTo(p.x-9,p.y);g.moveTo(p.x+9,p.y);g.lineTo(p.x+13,p.y);g.stroke();}}
    g.globalAlpha=1;g.font='11px "Segoe UI",sans-serif';g.fillStyle=sceneInk;
    const boxes=[],labelLimit=focus?16:22;
    const ordered=[...nodes].filter(n=>!focus||near.has(n.id)).sort((a,b)=>(b.id===focus?1:0)-(a.id===focus?1:0)||b.degree-a.degree||a.id.localeCompare(b.id));
    for(const n of ordered){if(boxes.length>=labelLimit)break;if(!n.degree&&n.id!==focus)continue;const p=screen(n),raw=displayLabel(n),max=30,text=raw.length>max?raw.slice(0,max)+'…':raw,left=p.x+9,top=p.y-10,right=left+g.measureText(text).width,bottom=top+17;
      if(right>width-20||left<20||top<20||bottom>height-105)continue;
      if(boxes.some(b=>left<b.right+7&&right>b.left-7&&top<b.bottom+4&&bottom>b.top-4))continue;
      boxes.push({left,right,top,bottom});g.globalAlpha=n.id===focus?1:.75;g.fillText(text,left,top+13);}
    g.globalAlpha=1;
  }
  function currentAmount(now){if(!transition)return amount;const t=Math.min(1,(now-transition.started)/duration);return transition.from+(transition.to-transition.from)*(t*t*(3-2*t));}
  function setMode(mode){
    if(!['graph','image'].includes(mode))return;if(mode===target&&transition)return;
    target=mode;toggle.textContent=mode==='image'?'Grafa dön ↔':'Resme geç ↔';
    if(mode==='image'&&!image){error.textContent='Önce bir resim seç. Resim hazır olana kadar graf korunur.';return;}
    document.body.dataset.mode=mode;if(mode==='image'){cancelDrag();hoverId=null;hideTooltip();stopLiveTimer();}else scheduleLive();
    if(image)error.textContent='';const now=performance.now();amount=currentAmount(now);const to=mode==='image'?1:0;
    if(Math.abs(amount-to)<.00001){transition=null;requestDraw();return;}
    transition={from:amount,to,started:now};stats.transitionStarts++;requestDraw();
  }
  function trace(now){
    if(reducedMotion.matches)return;
    const active=pulse&&now-pulse.started<800;
    if(!active&&!effectiveLive())return;
    const id=active?pulse.id:selectedId,paths=id?edges.filter(e=>e.source===id||e.target===id):edges.filter((_,i)=>i%Math.max(1,Math.floor(edges.length/18))===0);
    const phase=active?(now-pulse.started)/800:(now%6000)/6000;
    ctx.save();ctx.globalAlpha=(1-amount)*(active?Math.sin(phase*Math.PI)*.95:.8);
    for(let i=0;i<Math.min(paths.length,40);i++){const e=paths[i],a=screen(e.a),b=screen(e.b),t=active?phase:(phase+hash(e.source+e.target))%1;ctx.fillStyle=nodeColor(e.a);ctx.beginPath();ctx.arc(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,active?2.6:2,0,Math.PI*2);ctx.fill();}
    ctx.restore();if(active)requestDraw();else pulse=null;
  }
  function draw(now){
    raf=0;stats.frames++;if(effectiveLive()&&target==='graph'&&!drag){visualTime=now;graphDirty=true;}if(graphDirty)renderGraph();
    if(transition){amount=currentAmount(now);if(now-transition.started>=duration){amount=transition.to;stats.lastTransitionMs=now-transition.started;transition=null;stats.transitionEnds++;}}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;
    // Both layers are opaque: one alpha operation produces a true linear crossfade.
    if(image){const scale=Math.max(width/image.naturalWidth,height/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;ctx.drawImage(image,(width-w)/2,(height-h)/2,w,h);}else{ctx.fillStyle=appearance.background;ctx.fillRect(0,0,width,height);}
    if(amount<1){ctx.globalAlpha=1-amount;ctx.drawImage(graphCanvas,0,0,width,height);ctx.globalAlpha=1;trace(now);}
    if(transition)requestDraw();
  }
  function resize(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=graphCanvas.width=Math.round(width*dpr);canvas.height=graphCanvas.height=Math.round(height*dpr);fitting=true;invalidate();}
  worker.onmessage=({data})=>{if(data.generation!==generation)return;stats.workerMessages++;nodes.forEach((n,i)=>{n.x=data.positions[i*2];n.y=data.positions[i*2+1];});settled=data.type==='settled';graphDirty=true;if(settled){stats.settles++;savePositions();}if(amount<1||transition)requestDraw();};
  worker.onerror=()=>{error.textContent='Yerleşim işlemi durdu; son konumlar korunuyor.';settled=true;savePositions();};
  function hit(x,y){let closest=null,distance=13*13;for(const n of nodes){const p=screen(n),d=(x-p.x)**2+(y-p.y)**2;if(d<distance){distance=d;closest=n;}}return closest;}
  function hideTooltip(){tooltip.hidden=true;}
  function showTooltip(n,x,y){
    if(!n){hideTooltip();return;}tooltip.querySelector('strong').textContent=displayLabel(n);tooltip.querySelector('span').textContent=`${n.degree} bağlantı · ${n.id}`;
    tooltip.hidden=false;tooltip.style.left=Math.max(8,Math.min(width-350,x+18))+'px';tooltip.style.top=Math.max(8,Math.min(height-100,y+18))+'px';
  }
  function pulseNode(id){if(!id||reducedMotion.matches)return;pulse={id,started:performance.now()};requestDraw();}
  function renderSelection(){
    const n=byId.get(selectedId);$('selection').hidden=!n;if(!n)return;
    $('selected-label').textContent=displayLabel(n);$('selected-path').textContent=n.unresolved?`Henüz oluşturulmamış not · ${n.id}`:n.id;$('open-note').disabled=!!n.unresolved;refreshAppearanceControls();
    const container=$('connections');container.replaceChildren();
    for(const [direction,title]of [['out','GİDEN BAĞLANTILAR'],['in','GELEN BAĞLANTILAR']]){
      const list=new Map();for(const e of edges)if((direction==='out'?e.source:e.target)===n.id){const id=direction==='out'?e.target:e.source;list.set(id,(list.get(id)||0)+e.count);}
      const heading=document.createElement('h3');heading.textContent=`${title} / ${list.size}`;container.append(heading);
      if(!list.size){const p=document.createElement('p');p.className='empty-list';p.textContent='Bu yönde bağlantı yok.';container.append(p);}
      for(const[id,count]of [...list].sort((a,b)=>(byId.get(a[0]).label||a[0]).localeCompare(byId.get(b[0]).label||b[0]))){const button=document.createElement('button');button.className='connection';button.dataset.id=id;button.title=id;const label=document.createElement('span');label.className='connection-title';label.textContent=displayLabel(byId.get(id));const counter=document.createElement('span');counter.className='connection-count';counter.textContent=String(count);button.append(label,counter);button.onclick=()=>selectNode(id,true);container.append(button);}
    }
  }
  function selectNode(id,center=false){selectedId=byId.has(id)?id:null;stats.selections++;renderSelection();if(center&&selectedId){const n=byId.get(selectedId);camera.offsetX=-(n.x-fit.x)*fit.scale*camera.zoom-45;camera.offsetY=-(n.y-fit.y)*fit.scale*camera.zoom;}pulseNode(selectedId);invalidate();}
  function resetView(){if(target!=='graph')return;camera.zoom=1;camera.offsetX=camera.offsetY=0;fitting=true;invalidate();}
  function zoomAt(factor,x=fit.cx,y=fit.cy){if(target!=='graph')return;const before=world(x,y);camera.zoom=Math.max(.22,Math.min(12,camera.zoom*factor));camera.offsetX=x-fit.cx-(before.x-fit.x)*fit.scale*camera.zoom;camera.offsetY=y-fit.cy-(before.y-fit.y)*fit.scale*camera.zoom;stats.zooms++;hideTooltip();invalidate();}
  function handleZoomGesture(data){
    if(target!=='graph'||!Number.isFinite(data.factor)||data.factor<=0)return;
    const factor=Math.max(.5,Math.min(2,data.factor)),xr=Number.isFinite(data.xRatio)?Math.max(0,Math.min(1,data.xRatio)):.5,yr=Number.isFinite(data.yRatio)?Math.max(0,Math.min(1,data.yRatio)):.5,x=xr*innerWidth,y=yr*innerHeight;
    const element=document.elementFromPoint(x,y),panel=element?.closest('#appearance-panel,#selection,#search-results');
    if(panel){panel.scrollTop+=Math.max(-220,Math.min(220,-Math.log(factor)/.0015));return;}
    if(element?.closest('#controls'))return;zoomAt(factor,x,y);
  }
  canvas.addEventListener('wheel',e=>{if(target!=='graph')return;e.preventDefault();zoomAt(Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.002),e.clientX,e.clientY);},{passive:false});
  canvas.addEventListener('pointerdown',e=>{
    stats.pointerDowns++;if(target!=='graph'||e.button!==0)return;
    const node=hit(e.clientX,e.clientY);drag={id:node?.id,startX:e.clientX,startY:e.clientY,x:node?.x,y:node?.y,offsetX:camera.offsetX,offsetY:camera.offsetY,moved:false,pointerId:e.pointerId};
    if(node&&!settled){generation++;worker.postMessage({type:'pause'});settled=true;fitting=false;}
    canvas.setPointerCapture?.(e.pointerId);hideTooltip();canvas.style.cursor='grabbing';
  });
  canvas.addEventListener('pointermove',e=>{
    stats.pointerMoves++;if(target!=='graph')return;
    if(drag){const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(Math.hypot(dx,dy)>3)drag.moved=true;if(!drag.moved)return;
      if(drag.id){const n=byId.get(drag.id);if(!n){cancelDrag();return;}n.x=drag.x+dx/(fit.scale*camera.zoom);n.y=drag.y+dy/(fit.scale*camera.zoom);}else{camera.offsetX=drag.offsetX+dx;camera.offsetY=drag.offsetY+dy;}invalidate();return;}
    const n=hit(e.clientX,e.clientY),id=n?.id||null;if(id!==hoverId){hoverId=id;invalidate();}showTooltip(n,e.clientX,e.clientY);canvas.style.cursor=n?'pointer':'grab';
  });
  function endPointer(e,cancelled=false){if(!drag)return;const finished=drag;drag=null;if(cancelled)stats.pointerCancels++;if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);canvas.style.cursor='grab';if(finished.moved){suppressClickUntil=performance.now()+350;if(finished.id){stats.nodeDrags++;savePositions();pulseNode(finished.id);}else stats.pans++;}invalidate();}
  function cancelDrag(){if(drag)endPointer({pointerId:drag.pointerId},true);}
  canvas.addEventListener('pointerup',e=>endPointer(e));canvas.addEventListener('pointercancel',e=>endPointer(e,true));
  // Lively's forwarded desktop click can survive a pointer-capture/blur cancellation.
  // Selection belongs to click; down/up own dragging only, with one drag-click suppressed.
  canvas.addEventListener('click',e=>{stats.clicks++;if(target!=='graph'||e.button!==0)return;if(performance.now()<suppressClickUntil){suppressClickUntil=0;return;}selectNode(hit(e.clientX,e.clientY)?.id||null);});
  canvas.addEventListener('pointerleave',()=>{hideTooltip();if(!drag&&hoverId){hoverId=null;invalidate();}});
  $('close-selection').onclick=()=>selectNode(null);$('reset-view').onclick=resetView;$('zoom-in').onclick=()=>zoomAt(1.25);$('zoom-out').onclick=()=>zoomAt(.8);
  function hideSearch(){results=[];$('search-results').hidden=true;$('search').setAttribute('aria-expanded','false');$('search').removeAttribute('aria-activedescendant');}
  function renderSearch(){
    const container=$('search-results');container.replaceChildren();container.hidden=false;$('search').setAttribute('aria-expanded','true');
    if(!results.length){$('search').removeAttribute('aria-activedescendant');const p=document.createElement('div');p.className='no-result';p.textContent='Bu aramayla eşleşen not yok.';container.append(p);return;}
    results.forEach((n,i)=>{const button=document.createElement('button');button.className='search-result';button.id='result-'+i;button.role='option';button.setAttribute('aria-selected',String(i===resultIndex));button.tabIndex=-1;const label=document.createElement('strong');label.textContent=displayLabel(n);const path=document.createElement('small');path.textContent=n.id;button.append(label,path);button.onclick=()=>{selectNode(n.id,true);hideSearch();};container.append(button);});
    $('search').setAttribute('aria-activedescendant','result-'+resultIndex);
  }
  $('search').oninput=e=>{const query=e.target.value.trim().toLocaleLowerCase('tr');if(!query){hideSearch();return;}results=nodes.filter(n=>(n.label+' '+n.id).toLocaleLowerCase('tr').includes(query)).sort((a,b)=>b.degree-a.degree).slice(0,30);resultIndex=0;renderSearch();};
  $('search').onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(results.length){resultIndex=(resultIndex+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;renderSearch();$('result-'+resultIndex).scrollIntoView({block:'nearest'});}}else if(e.key==='Enter'&&results.length){e.preventDefault();selectNode(results[resultIndex].id,true);hideSearch();}else if(e.key==='Escape'){hideSearch();$('search').blur();}};
  document.addEventListener('pointerdown',e=>{if(!$('controls').contains(e.target))hideSearch();});
  document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target.isContentEditable)return;if(e.key==='/'){e.preventDefault();$('search').focus();}if(e.key==='0')resetView();if(e.key==='Escape')selectNode(null);if(e.key==='+'||e.key==='=')zoomAt(1.25);if(e.key==='-')zoomAt(.8);});
  function stopLiveTimer(){if(liveTimer)clearTimeout(liveTimer);liveTimer=null;}
  function scheduleLive(){stopLiveTimer();if(!effectiveLive()||document.hidden||hostPaused||target!=='graph')return;liveTimer=setTimeout(()=>{liveTimer=null;requestDraw();scheduleLive();},50);}
  $('live').onclick=()=>{if(reducedMotion.matches){error.textContent='Sistemindeki azaltılmış hareket tercihi açık; ışık akışı kapalı tutuluyor.';return;}saveAppearance({live:!appearance.live});};
  reducedMotion.addEventListener('change',event=>{live=appearance.live&&!event.matches&&appearance.motion!=='still';if(event.matches)pulse=null;scheduleLive();invalidate();});
  async function preloadImage(url){
    if(!url)return;imagePending=true;const revision=++imageRevision,candidate=new Image();candidate.decoding='async';candidate.src=url+(url.includes('?')?'&':'?')+'v='+Date.now();
    try{await candidate.decode();if(revision!==imageRevision)return;image=candidate;error.textContent='';if(target==='image')setMode('image');requestDraw();}catch{if(revision===imageRevision){error.textContent='Resim yüklenemedi; graf korunuyor.';target='graph';setMode('graph');}}finally{if(revision===imageRevision)imagePending=false;}
  }
  async function post(path,body,type='application/json'){const response=await fetch(path,{method:'POST',headers:{'Content-Type':type,'X-Control-Token':token},body:type==='application/json'?JSON.stringify(body):body});if(!response.ok)throw new Error(`İşlem başarısız (${response.status})`);return response;}
  toggle.onclick=async()=>{try{await post('/api/mode',{mode:target==='graph'?'image':'graph'});}catch(e){error.textContent=e.message;}};
  $('image').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{await post('/api/image',file,file.type);await preloadImage('/api/image');}catch(err){error.textContent=err.message;}};
  $('open-note').onclick=async()=>{if(!selectedId)return;try{await post('/api/open',{id:selectedId});error.textContent='';}catch(e){error.textContent=e.message;}};
  $('explore').onclick=async()=>{try{await post('/api/explore',{});}catch(e){error.textContent=e.message;}};
  window.livelyPropertyListener=(name,value)=>{if(name==='mode')setMode(Number(value)===1?'image':'graph');};
  window.livelyWallpaperPlaybackChanged=data=>{try{const state=typeof data==='string'?JSON.parse(data):data;if(typeof state?.IsPaused!=='boolean')return;hostPaused=state.IsPaused;if(hostPaused){cancelDrag();if(raf)cancelAnimationFrame(raf);raf=0;worker.postMessage({type:'pause'});stopLiveTimer();}else if(!document.hidden){if(!settled)worker.postMessage({type:'resume'});scheduleLive();invalidate();}}catch{}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrag();if(raf)cancelAnimationFrame(raf);raf=0;worker.postMessage({type:'pause'});stopLiveTimer();}else if(!hostPaused){if(!settled)worker.postMessage({type:'resume'});scheduleLive();requestDraw();}});
  addEventListener('blur',cancelDrag);$('search').setAttribute('role','combobox');$('search').setAttribute('aria-autocomplete','list');
  addEventListener('resize',resize);addEventListener('pagehide',savePositions);
  window.hafiza={setMode,diagnostics:()=>({...stats,nodes:nodes.length,edges:edges.length,target,amount,transitioning:!!transition,rafPending:!!raf,settled,imageReady:!!image,imagePending,generatedAt,selectedNode:selectedId,hoverNode:hoverId,view:{...camera,scale:fit.scale*camera.zoom},live:effectiveLive(),hostPaused,appearance:JSON.parse(JSON.stringify(appearance)),nodeColors:nodes.map(n=>[n.id,nodeColor(n)]),reducedMotion:reducedMotion.matches,positions:nodes.map(n=>[n.id,n.x,n.y])}),interactionPoints:()=>nodes.map(n=>({id:n.id,label:n.label,unresolved:!!n.unresolved,degree:n.degree,...screen(n)})),resetInteractionCounters:()=>{for(const key of ['pointerDowns','pointerMoves','pointerCancels','clicks','pans','nodeDrags','selections','zooms'])stats[key]=0;}};
  async function start(){resize();try{
    const[state,snapshot]=await Promise.all([fetch('/api/state').then(r=>r.json()),fetch('/api/snapshot').then(r=>r.ok?r.json():null)]);token=state.controlToken||state.token||'';duration=Number(state.duration)||500;if(state.hotkey)$('shortcut').textContent=state.hotkey;
    applySnapshot(snapshot);if(state.appearance)applyAppearance(state.appearance);else applyAppearance(appearance);target=state.mode||'graph';toggle.textContent=target==='image'?'Grafa dön ↔':'Resme geç ↔';if(state.imageUrl)await preloadImage(state.imageUrl);
    const events=new EventSource('/api/events?client='+ (document.body.classList.contains('wallpaper')?'wallpaper':'browser'));events.addEventListener('snapshot',e=>{try{applySnapshot(JSON.parse(e.data));}catch{}});events.addEventListener('mode',e=>{try{setMode(JSON.parse(e.data).mode);}catch{}});events.addEventListener('image',e=>{try{preloadImage(JSON.parse(e.data).imageUrl||'/api/image');}catch{}});events.addEventListener('appearance',e=>{try{if(!pendingAppearanceWrites)applyAppearance(JSON.parse(e.data));}catch{}});events.addEventListener('zoom',e=>{try{handleZoomGesture(JSON.parse(e.data));}catch{}});events.onerror=()=>{status.textContent=`Köprü bağlantısı kesildi · son graf korunuyor (${nodes.length} not)`;};
  }catch(e){error.textContent='Yerel köprüye ulaşılamadı. Başlatma betiğini çalıştır.';}}
  start();
})();
