import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validateCatalog,searchIndex,filterPositions,SOURCE_SHA256} from '../src/domain.js';
import {build} from '../scripts/build.mjs';
import {runtimeFiles} from '../scripts/files.mjs';

function fixture(){return {schema:1,edition:'2026-07-01',source_sha256:SOURCE_SHA256,
 sections:[{id:'synthetic',title:'Synthetic section',pages:[1,1]}],
 rules:[{id:'synthetic-rule',title:'Synthetic rule',text:'Original synthetic rule',pages:[1]}],
 positions:Array.from({length:917},(_,i)=>({id:`synthetic-${i}`,title:`Synthetic ${i}`,code:'',section:'synthetic',unit:'unit',notes:'',hierarchy:[],flags:[],rule_ids:['synthetic-rule'],
  source:{pdf_page:1,y_min:i,y_max:i+1},price:{kind:'fixed_chf',chf:'1.00'}})),report:{rows:917,warnings:[]}};}
const mutations={
 duplicateRule:c=>c.rules.push({...c.rules[0],text:'Conflicting synthetic replacement'}),
 duplicateSection:c=>c.sections.push({...c.sections[0],title:'Conflicting section'}),
 nonprimitiveSection:c=>c.sections.push({id:['unused'],title:'Ambiguous section',pages:[1,1]}),
 missingSectionTitle:c=>delete c.sections[0].title
};
test('unique synthetic rule identity keeps search and displayed original rules in agreement',()=>{
 const c=fixture();assert.equal(validateCatalog(c),c);
 assert.equal(filterPositions(c,searchIndex(c),{query:'Original synthetic rule'}).length,917);
 assert.equal(c.rules.find(r=>r.id===c.positions[0].rule_ids[0]).text,'Original synthetic rule');
});
for(const [name,mutate]of Object.entries(mutations))test(`reject ambiguous catalog metadata: ${name}`,()=>{
 const c=fixture();mutate(c);assert.throws(()=>validateCatalog(c),/Quellregel|Bereich|Katalog|doppelt/,'metadata IDs must resolve to exactly one named object');
});

test('ambiguous source rules cannot replace a usable static build',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'alt-unique-metadata-'));
 try{
  const c=fixture(),json={
   'catalog.json':c,'import-report.json':c.report,
   'source-pages.json':{source_sha256:SOURCE_SHA256,edition:c.edition,pages:Array.from({length:34},(_,i)=>({page:i+1,text:'Synthetic page'}))},
   'provenance.json':{retrieved_at:'synthetic',files:[{sha256:SOURCE_SHA256,bytes:932872,url:'https://www.bag.admin.ch/dam/synthetic.pdf'}]}};
  for(const source of Object.values(runtimeFiles)){
   const p=path.join(root,source);await mkdir(path.dirname(p),{recursive:true});
   await writeFile(p,source.startsWith('public/data/')?JSON.stringify(json[path.basename(source)]):await readFile(new URL('../'+source,import.meta.url)));
  }
  await build({root});const before=await Promise.all(Object.keys(runtimeFiles).map(f=>readFile(path.join(root,'dist',f))));
  mutations.duplicateRule(c);const raw=JSON.stringify(c);await writeFile(path.join(root,'public/data/catalog.json'),raw);
  await assert.rejects(()=>build({root}),/Quellregel|doppelt/);
  for(const [i,f]of Object.keys(runtimeFiles).entries())assert.deepEqual(await readFile(path.join(root,'dist',f)),before[i]);
  assert.equal(await readFile(path.join(root,'public/data/catalog.json'),'utf8'),raw);
 }finally{await rm(root,{recursive:true,force:true});}
});
