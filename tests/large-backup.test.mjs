import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as domain from '../src/domain.js';

// Actual registered handlers, synthetic DOM/Storage only. Blob bytes and their
// UTF-8 size are real; no browser or personal data is needed for this contract.
async function fixture(character='界') {
 const catalog={edition:'2026-07-01',source_sha256:domain.SOURCE_SHA256,sections:[],rules:[],report:{warnings:[]},
  positions:Array.from({length:917},(_,i)=>({id:`synthetic-${i}`,title:`Synthetic ${i}`,code:'',unit:'unit',section:'synthetic',flags:[],hierarchy:[],notes:'',rule_ids:[],source:{pdf_page:1},price:{kind:'fixed_chf',chf:'1.00'}}))};
 const initial={...domain.emptyWorkspace(catalog),name:'界'.repeat(120),note:'界'.repeat(10000),
  lines:catalog.positions.map(p=>({id:p.id,quantity:'1',note:character.repeat(2000)}))};
 domain.validateWorkspace(initial,catalog);
 const nodes=new Map(),downloads=[],writes=[];
 class Element {
  constructor(){Object.assign(this,{value:'',textContent:'',children:[],dataset:{},events:{},disabled:false,open:false});}
  append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
  setAttribute(k,v){this[k]=v;} addEventListener(k,f){(this.events[k]??=[]).push(f);}
  fire(k){for(const f of this.events[k]||[])f();} click(){this.fire('click');}
  showModal(){this.open=true;} close(){this.open=false;this.fire('close');} remove(){}
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 let raw=JSON.stringify(initial);
 const storage={getItem:k=>{assert.equal(k,domain.STORAGE_KEY);return raw;},setItem(k,v){assert.equal(k,domain.STORAGE_KEY);writes.push(v);raw=v;}};
 class DownloadURL extends URL {static createObjectURL(blob){downloads.push(blob);return 'blob:synthetic';} static revokeObjectURL(){}}
 const context=vm.createContext({...domain,structuredClone,Blob,URL:DownloadURL,setTimeout:()=>0,
  document:{getElementById:get,createElement:()=>new Element(),createDocumentFragment:()=>new Element(),querySelectorAll:()=>[],body:new Element()},
  window:{addEventListener(){}}});
 context.fixture={catalog,storage};
 const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 vm.runInContext(source.replace(/^import[^\n]+\n/,'').replace(/async function load\(\)\{[\s\S]*$/,''),context);
 vm.runInContext(`catalog=fixture.catalog; pages={pages:[]}; provenance={retrieved_at:'synthetic',files:[{url:'https://example.invalid/source.pdf',bytes:1}]};
  byId=new Map(catalog.positions.map(p=>[p.id,p]));index=searchIndex(catalog);guard=new StorageGuard(fixture.storage,catalog);workspace=structuredClone(guard.workspace);initialize();`,context);
 return {get,downloads,writes,raw:()=>raw,initial,async select(blob){get('import-file').files=[{size:blob.size,text:()=>blob.text()}];get('import-file').fire('change');for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));}};
}

for(const character of ['界','\u0000'])test('a maximum valid collection reopens its own JSON export ('+JSON.stringify(character)+')',async()=>{
 const a=await fixture(character);a.get('export-json').click();assert.equal(a.downloads.length,1);
 const backup=a.downloads[0];assert.ok(backup.size>5*1024*1024,'exercise the former five-MiB rejection');
 assert.deepEqual(JSON.parse(await backup.text()),a.initial);
 a.get('plan-name').value='Synthetic changed draft';a.get('plan-name').fire('input');const before=a.raw();
 await a.select(backup);
 assert.equal(a.get('import-dialog').open,true,'valid self-export must reach the import preview');
 assert.equal(a.raw(),before,'preview is nonmutating');assert.equal(a.get('import-confirm').disabled,true);
 a.get('import-before').click();assert.equal(a.get('import-confirm').disabled,false);
 assert.equal(JSON.parse(await a.downloads[1].text()).name,'Synthetic changed draft');
 a.get('import-confirm').click();assert.deepEqual(JSON.parse(a.raw()),a.initial);
 assert.equal(a.get('import-dialog').open,false);assert.equal(a.writes.length,2);
});

test('the larger bound remains finite and refuses oversized input without reading or writing',async()=>{
 const a=await fixture(),before=a.raw();let reads=0;
 a.get('import-file').files=[{size:16*1024*1024+1,text:async()=>{reads++;return '{}';}}];
 a.get('import-file').fire('change');await new Promise(r=>setImmediate(r));
 assert.equal(reads,0);assert.equal(a.writes.length,0);assert.equal(a.raw(),before);
 assert.equal(a.get('import-dialog').open,false);assert.match(a.get('status').textContent,/gross/);
});
