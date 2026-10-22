'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {evaluate} = require('./metadata-cdp.cjs');
const metadataPath = path.resolve(__dirname,'../obsidian-plugin/metadata.js').replaceAll('\\','/');
const read = `({ resolved: app.metadataCache.resolvedLinks, unresolved: app.metadataCache.unresolvedLinks, snapshot: require(${JSON.stringify(metadataPath)}).buildSnapshot(app) })`;
const run = expression => evaluate(expression,9224,'metadata-fixture-vault');
async function main() {
  const initial = await run(read);
  const edge=(s,t)=>initial.snapshot.edges.find(e=>e.source===s&&e.target===t);
  assert.equal(edge('Başlangıç.md','Türkçe/İstanbul.md').count,3,'wikilink alias + Markdown + heading links aggregate');
  assert.equal(edge('Başlangıç.md','A/Aynı.md').count,1);
  assert.equal(edge('Başlangıç.md','B/Aynı.md').count,1);
  assert.equal(edge('Türkçe/İstanbul.md','A/Aynı.md').count,1,'relative link resolved officially');
  assert(initial.snapshot.nodes.some(n=>n.id==='Yetim.md'),'orphans retained');
  assert(edge('A/Aynı.md','unresolved:A/YerelEksik'));
  assert(edge('B/Aynı.md','unresolved:B/YerelEksik'));
  const rename=await run(`(async()=>{let resolved=0;const ref=app.metadataCache.on('resolved',()=>resolved++);await app.vault.rename(app.vault.getAbstractFileByPath('Türkçe/İstanbul.md'),'Türkçe/İzmir.md');await new Promise(r=>setTimeout(r,1400));app.metadataCache.offref(ref);return {resolved,data:${read}}})()`);
  assert(rename.data.snapshot.nodes.some(n=>n.id==='Türkçe/İzmir.md'));
  assert(!rename.data.snapshot.nodes.some(n=>n.id==='Türkçe/İstanbul.md'));
  assert(rename.data.snapshot.edges.every(e=>e.target!=='Türkçe/İstanbul.md'));
  assert(rename.resolved>0);
  const deleted=await run(`(async()=>{let resolved=0;const ref=app.metadataCache.on('resolved',()=>resolved++);await app.vault.delete(app.vault.getAbstractFileByPath('B/Aynı.md'));await new Promise(r=>setTimeout(r,1400));app.metadataCache.offref(ref);return {resolved,data:${read}}})()`);
  assert(!deleted.data.snapshot.nodes.some(n=>n.id==='B/Aynı.md'));
  assert(deleted.data.snapshot.edges.every(e=>e.target!=='B/Aynı.md'&&e.source!=='B/Aynı.md'));
  assert(deleted.resolved>0);
  for(const stage of [initial,rename.data,deleted.data]) {
    for(const node of stage.snapshot.nodes) assert(Object.keys(node).every(k=>['id','label','unresolved'].includes(k)));
    for(const edge of stage.snapshot.edges) assert.deepEqual(Object.keys(edge).sort(),['count','source','target']);
  }
  const actual=await evaluate(`(()=>{const p=app.plugins.getPlugin('hafiza-wallpaper');const snapshot=p.buildSnapshot(app);return {version:app.version,markdownFiles:app.vault.getMarkdownFiles().length,snapshot,lastExport:p.lastExport,error:p.lastError}})()`);
  const evidence={testedAt:new Date().toISOString(),actualUserProfileVersion:'1.14.4',fixtureProfileVersion:'1.11.7',checks:['wikilink alias','Markdown link','heading link aggregation','duplicate basename','Turkish paths','relative resolved and unresolved links','orphans','rename','delete','no-body schema'],initial,rename,deleted,actual:{markdownFiles:actual.markdownFiles,nodeCount:actual.snapshot.nodes.length,edgeCount:actual.snapshot.edges.length,lastExport:actual.lastExport,error:actual.error}};
  const output=path.resolve(__dirname,'../runtime/metadata-evidence.json');
  fs.writeFileSync(output,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({pass:true,checks:evidence.checks,actual:evidence.actual,evidence:output},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
