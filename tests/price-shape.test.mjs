import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,copyFile,readdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateCatalog,lineAmount,money} from '../src/domain.js';
import {publicMembers,runtimeFiles} from '../scripts/files.mjs';

const project=fileURLToPath(new URL('../',import.meta.url));
const original=await readFile(new URL('../public/data/catalog.json',import.meta.url));
const catalog=JSON.parse(original);
// Mutate a real later row, retaining its genuine nonempty cells for kind-only cases.
const index=catalog.positions.findLastIndex(p=>p.price.kind==='graduated_chf'&&p.price.cells.length>1);
assert.ok(index>0);
const originalCells=catalog.positions[index].price.cells;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const kinds={fixed_chf:49,graduated_chf:817,reference_only:4,taxpoints:31,unpriced:16};
const cases=[
 {name:'graduated_empty',mutate:p=>p.cells=[],error:/Leere CHF-Staffel\./},
 {name:'graduated_missing',mutate:p=>delete p.cells,error:/Staffeln fehlen\./},
 {name:'graduated_null',mutate:p=>p.cells=null,error:/Staffeln fehlen\./},
 {name:'graduated_nonarray',mutate:p=>p.cells={},error:/Staffeln fehlen\./},
 {name:'kind_array',mutate:p=>p.kind=['graduated_chf'],error:/Unbekannte Preisart\./,kindOnly:true},
 {name:'kind_nested_array',mutate:p=>p.kind=[['graduated_chf']],error:/Unbekannte Preisart\./,kindOnly:true},
 {name:'kind_object',mutate:p=>p.kind={},error:/Unbekannte Preisart\./,kindOnly:true},
 {name:'kind_null',mutate:p=>p.kind=null,error:/Unbekannte Preisart\./,kindOnly:true},
 {name:'kind_number',mutate:p=>p.kind=1,error:/Unbekannte Preisart\./,kindOnly:true},
 {name:'kind_boolean',mutate:p=>p.kind=true,error:/Unbekannte Preisart\./,kindOnly:true},
 {name:'kind_wrong_token',mutate:p=>p.kind=' graduated_chf',error:/Unbekannte Preisart\./,kindOnly:true},
 {name:'kind_missing',mutate:p=>delete p.kind,error:/Unbekannte Preisart\./,kindOnly:true},
 {name:'graduated_descending',mutate:p=>p.cells.reverse(),error:/Nicht aufsteigende Staffel\./},
 {name:'graduated_duplicate',mutate:p=>p.cells[1].quantity=p.cells[0].quantity,error:/Nicht aufsteigende Staffel\./},
 {name:'graduated_invalid_chf',mutate:p=>p.cells[0].chf='NaN',error:/Ungültiger CHF-Quellbetrag\./}
];
function mutant(fixture){
 const c=structuredClone(catalog);fixture.mutate(c.positions[index].price);
 if(fixture.kindOnly){
  assert.deepEqual(c.positions[index].price.cells,originalCells,'kind-only mutation must retain genuine nonempty source cells');
  assert.ok(c.positions[index].price.cells.length>1);
 }
 return c;
}
async function files(root,prefix=''){
 const out=[];
 for(const e of await readdir(root,{withFileTypes:true})){
  const key=prefix+e.name;
  if(e.isDirectory())out.push(...await files(path.join(root,e.name),key+'/'));
  else {assert.ok(e.isFile()&&!e.isSymbolicLink(),'regular build member: '+key);out.push(key);}
 }
 return out.sort();
}
async function snapshot(root){
 const names=await files(root);
 assert.deepEqual(names,Object.keys(runtimeFiles).sort(),'complete nine-file runtime path set');
 assert.equal(names.length,9);
 return Object.fromEntries(await Promise.all(names.map(async name=>[name,sha(await readFile(path.join(root,name)))])));
}
function cli(root,script){
 const argv=[process.execPath,script];
 const r=spawnSync(argv[0],argv.slice(1),{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
 assert.ifError(r.error);
 assert.equal(r.signal,null,'CLI must finish normally, not by signal');
 assert.equal(typeof r.status,'number');
 return {argv,cwd:root,exit:r.status,stdout:r.stdout,stderr:r.stderr};
}
async function copiedProject(){
 const root=await mkdtemp(path.join(os.tmpdir(),'alt-price-shape-'));
 try{
  for(const name of publicMembers){
   const dest=path.join(root,name);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(project,name),dest);
  }
  return root;
 }catch(error){await rm(root,{recursive:true,force:true});throw error;}
}

test('price shape: original 917 rows and all five primitive price kinds remain valid without mutation',()=>{
 const c=JSON.parse(original),before=JSON.stringify(c);
 assert.strictEqual(validateCatalog(c),c);
 assert.equal(JSON.stringify(c),before);
 assert.equal(c.positions.length,917);
 assert.deepEqual(Object.fromEntries(Object.keys(kinds).map(k=>[k,c.positions.filter(p=>p.price.kind===k).length])),kinds);
 assert.ok(c.positions.every(p=>typeof p.price.kind==='string'));
 for(const p of c.positions.filter(p=>['unpriced','reference_only'].includes(p.price.kind)))assert.equal(lineAmount(p,'1').cents,null);
 const material=c.positions.find(p=>p.title==='Absinthii herba Ph. Eur.');
 for(const [q,want] of [['0.000001',10n],['3.2',30n],['3.21',35n],['500',1575n],['1000',2800n],['600',null]])assert.equal(lineAmount(material,q).cents,want);
 const service=c.positions.find(p=>p.code==='A.2.c');
 assert.equal(service.price.chf_per_point,'1.05');assert.equal(lineAmount(service,'1').cents,158n);
});

test('price shape: empty cells remain admissible for both genuinely open price kinds',()=>{
 for(const kind of ['unpriced','reference_only']){
  const c=JSON.parse(original),p=c.positions.find(p=>p.price.kind===kind);
  p.price.cells=[];const before=JSON.stringify(c);
  assert.strictEqual(validateCatalog(c),c);assert.equal(JSON.stringify(c),before);
  assert.equal(lineAmount(p,'1').cents,null);
 }
});

test('price shape: explicit zero CHF remains zero, not an open price (synthetic type-control only)',()=>{
 // The official corpus has no zero-CHF row; this is not a claimed source price.
 const c=JSON.parse(original),p=c.positions.find(p=>p.price.kind==='fixed_chf');
 p.price.chf='0.00';const before=JSON.stringify(c);
 assert.strictEqual(validateCatalog(c),c);assert.equal(JSON.stringify(c),before);
 assert.equal(lineAmount(p,'1').cents,0n);assert.equal(money(0n),'CHF 0.00');assert.equal(money(null),'offen');
});

for(const fixture of cases){
 test('price shape validator rejects '+fixture.name,()=>{
  const c=mutant(fixture),before=JSON.stringify(c);
  try{assert.throws(()=>validateCatalog(c),fixture.error);}finally{assert.equal(JSON.stringify(c),before,'validator must not repair or partially adopt invalid input');}
 });
 test('price shape actual check/build reject '+fixture.name+' and retain all nine last-good files',async()=>{
  const root=await copiedProject();
  try{
   const seedCheck=cli(root,'scripts/check.mjs'),seedBuild=cli(root,'scripts/build.mjs');
   assert.equal(seedCheck.exit,0,JSON.stringify(seedCheck));assert.equal(seedBuild.exit,0,JSON.stringify(seedBuild));
   const dist=path.join(root,'dist'),baseline=await snapshot(dist);
   for(const [dest,source] of Object.entries(runtimeFiles))assert.equal(baseline[dest],sha(await readFile(path.join(root,source))));
   const input=path.join(root,'public/data/catalog.json'),bytes=Buffer.from(JSON.stringify(mutant(fixture))+'\n');
   await writeFile(input,bytes);
   const attempts=[];
   // Execute both real entrypoints even on OLD, before evaluating the desired contract.
   for(const script of ['scripts/check.mjs','scripts/build.mjs']){
    const before=await snapshot(dist),result=cli(root,script),after=await snapshot(dist);
    const inputAfter=await readFile(input);
    attempts.push({...result,before,after,inputSha256Before:sha(bytes),inputSha256After:sha(inputAfter)});
   }
   console.log('PRICE_SHAPE_EVIDENCE '+JSON.stringify({fixture:fixture.name,positionId:catalog.positions[index].id,originalCellsSha256:sha(JSON.stringify(originalCells)),baseline,seedCheck,seedBuild,attempts}));
   for(const attempt of attempts){
    assert.equal(attempt.exit,1,'actual CLI must reject '+fixture.name+': '+attempt.argv.join(' '));
    assert.match(attempt.stderr,fixture.error,'intended price-shape refusal, not setup/import failure');
    assert.deepEqual(attempt.before,baseline,'complete last-good before refusal');
    assert.deepEqual(attempt.after,baseline,'all nine paths/hashes preserved after refusal');
    assert.equal(attempt.inputSha256After,attempt.inputSha256Before,'CLI must not repair or partially adopt input');
   }
   await writeFile(input,original);
   const recoveredCheck=cli(root,'scripts/check.mjs'),recoveredBuild=cli(root,'scripts/build.mjs');
   console.log('PRICE_SHAPE_RECOVERY '+JSON.stringify({fixture:fixture.name,recoveredCheck,recoveredBuild,after:await snapshot(dist)}));
   assert.equal(recoveredCheck.exit,0,JSON.stringify(recoveredCheck));assert.equal(recoveredBuild.exit,0,JSON.stringify(recoveredBuild));
   assert.deepEqual(await snapshot(dist),baseline,'restoring genuine input reproduces the entire last-good build');
  }finally{await rm(root,{recursive:true,force:true});}
 });
}
