'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../runtime/metadata-fixture-vault');
const profile = path.resolve(__dirname, '../runtime/metadata-fixture-profile');
const files = {
  'Başlangıç.md': '# Başlangıç\n[[Türkçe/İstanbul|Güzel şehir]]\n[Türkçe](Türkçe/İstanbul.md)\n[[A/Aynı]]\n[[B/Aynı]]\n[[Oluşturulmamış]]\n[[Türkçe/İstanbul#Başlık]]\n',
  'Türkçe/İstanbul.md': '# Başlık\n[[../A/Aynı]]\n',
  'A/Aynı.md': '# A\n[[./YerelEksik]]\n',
  'B/Aynı.md': '# B\n[[./YerelEksik]]\n',
  'Yetim.md': '# Yetim\n'
};
for(const [name,body] of Object.entries(files)) {fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),body);}
fs.mkdirSync(path.join(root,'.obsidian'),{recursive:true});
fs.writeFileSync(path.join(root,'.obsidian/app.json'),'{}');
fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{metadatafixture:{path:root,ts:Date.now(),open:true}}}));
console.log(JSON.stringify({root,profile}));
