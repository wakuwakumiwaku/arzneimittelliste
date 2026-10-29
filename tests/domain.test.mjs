import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as domain from '../src/domain.js';
import {validateCatalog,decimal,quantity,lineAmount,totals,money,altRound,emptyWorkspace,validateWorkspace,StorageGuard,STORAGE_KEY,filterPositions,searchIndex,csvCell,workspaceCsv} from '../src/domain.js';
const c=validateCatalog(JSON.parse(await readFile(new URL('../public/data/catalog.json',import.meta.url))));
const byId=new Map(c.positions.map(p=>[p.id,p])),find=s=>c.positions.find(p=>p.title===s);
const material=find('Absinthii herba Ph. Eur.');
test('complete official source edition and price-kind coverage',()=>{assert.equal(c.positions.length,917);assert.equal(new Set(c.positions.map(p=>p.id)).size,917);assert.deepEqual(c.report.sections,{I:752,aroma:64,aux:7,oils:11,blood:2,II:31,III:46,general:4});assert.deepEqual(c.report.price_kinds,{fixed_chf:49,graduated_chf:817,reference_only:4,taxpoints:31,unpriced:16});assert.match(find('Midazolamum hydrochloridum DAC').notes,/Schlafstörungen/);assert.match(find('Ivermectinum Ph. Eur.').notes,/Scabies/);});
test('decimal types, exact arithmetic, range and lexical rejection',()=>{assert.deepEqual(decimal('0,000001'),{n:1n,d:1000000n});for(const v of [null,1,[],{},'1e3','-1',' 1','01','NaN','Infinity','1.0000001','0','1000001'])assert.throws(()=>quantity(v));assert.throws(()=>quantity('1.5',true));assert.equal(quantity('1000000').n,1000000n);assert.equal(money(123456789123456789n),'CHF 1’234’567’891’234’567.89');});
test('ALT official 1.7.2 c boundary rounding, not floating-point nearest',()=>{for(const [n,d,expected]of [[320n,10n,30n],[321n,10n,35n],[370n,10n,35n],[371n,10n,40n],[20n,1n,20n],[2n,1n,0n],[21n,10n,5n]])assert.equal(altRound(n,d),expected);});
test('official material source cells, minimal price, next-column cap and beyond maximum',()=>{assert.equal(lineAmount(material,'0.000001').cents,10n);assert.equal(lineAmount(material,'1').cents,10n);assert.equal(lineAmount(material,'9').cents,40n);assert.equal(lineAmount(material,'12').cents,50n);assert.equal(lineAmount(material,'500').cents,1575n);assert.equal(lineAmount(material,'1000').cents,2800n);for(const q of ['501','600','900','1001'])assert.equal(lineAmount(material,q).cents,null);});
test('taxpoints never mistaken for CHF; fixed bags and manufacturer prices not added',()=>{const service=c.positions.find(p=>p.code==='A.2.c');assert.equal(service.price.points,'1.5');assert.equal(lineAmount(service,'1').cents,158n);assert.equal(lineAmount(service,'2').cents,315n);assert.throws(()=>lineAmount(service,'1.5'));const b=c.positions.find(p=>p.section==='blood'&&p.title.startsWith('Erythrozyten'));assert.equal(b.price.manufacturer_chf,'267.37');assert.equal(lineAmount(b,'1').cents,29945n);assert.equal(lineAmount(b,'2').cents,59890n);const capsule=c.positions.find(p=>p.title==='Gelatinekapseln No 00: 25 Stück');assert.equal(lineAmount(capsule,'1').cents,910n);assert.equal(lineAmount(capsule,'25').cents,22750n);});
test('unpriced source references and special units stay null, never false zero',()=>{for(const kind of ['unpriced','reference_only']){const p=c.positions.find(p=>p.price.kind===kind);assert.equal(lineAmount(p,'1').cents,null);const t=totals([{id:p.id,quantity:'1',note:''},{id:material.id,quantity:'1',note:''}],byId);assert.equal(t.cents,10n);assert.equal(t.unresolved,1);assert.equal(t.complete,false);}});
test('full-corpus search parity and filters, not only first DOM page',()=>{const idx=searchIndex(c);for(const p of c.positions){assert.ok(filterPositions(c,idx,{query:p.id}).some(x=>x.id===p.id));}assert.equal(filterPositions(c,idx,{section:'III'}).length,46);assert.equal(filterPositions(c,idx,{kind:'taxpoints'}).length,31);assert.ok(filterPositions(c,idx,{query:'Schlafstörungen'}).some(p=>p.title.startsWith('Midazolamum')));assert.ok(filterPositions(c,idx,{query:'Teegemische',section:'II'}).length>=3);assert.equal(filterPositions(c,idx,{query:'nichtvorhandenxyz987'}).length,0);assert.deepEqual(filterPositions(c,idx,{favoritesOnly:true,favorites:[material.id]}).map(p=>p.id),[material.id]);});
test('workspace exact schema, primitive IDs and decimal types, unique lines/favorites',()=>{const w=emptyWorkspace(c);w.name='Privater Entwurf';w.note='Notiz';w.lines=[{id:material.id,quantity:'2,5',note:'aktuell'}];w.favorites=[material.id];assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(w)),c),w);const bad=[{...w,version:'1'},{...w,sourceSha256:'x'},{...w,name:[]},{...w,extra:true},{...w,favorites:[[material.id]]},{...w,favorites:[material.id,material.id]},{...w,lines:[{...w.lines[0],id:[material.id]}]},{...w,lines:[...w.lines,...w.lines]},{...w,lines:[{...w.lines[0],quantity:1}]},{...w,lines:[{...w.lines[0],id:'unknown'}]},{...w,lines:[{...w.lines[0],note:{}}]}];for(const v of bad)assert.throws(()=>validateWorkspace(v,c));});
function storage(raw=null){let value=raw;return {getItem(){return value;},setItem(_k,s){value=s;},change(s){value=s;},raw(){return value;}};}
test('persistence native API contract: absent untouched, write/readback/reload',()=>{const s=storage(),g=new StorageGuard(s,c);assert.equal(s.raw(),null);const w=emptyWorkspace(c);w.lines=[{id:material.id,quantity:'1',note:'saved'}];g.save(w);assert.deepEqual(new StorageGuard(s,c).workspace,w);assert.equal(g.raw,s.raw());});
test('malformed/blocked storage and cross-tab conflict preserve exact existing bytes',()=>{for(const raw of ['{broken','null','[]',JSON.stringify({...emptyWorkspace(c),version:2})]){const s=storage(raw),g=new StorageGuard(s,c);assert.equal(g.locked,true);assert.throws(()=>g.save(emptyWorkspace(c)));assert.equal(s.raw(),raw);}const denied={getItem(){throw Error('denied');},setItem(){throw Error('must not write');}};assert.equal(new StorageGuard(denied,c).locked,true);const s=storage(),g=new StorageGuard(s,c);s.change('foreign');assert.throws(()=>g.save(emptyWorkspace(c)),/Fremdänderung/);assert.equal(s.raw(),'foreign');const writeDenied=new StorageGuard({getItem(){return null;},setItem(){throw Error('quota');}},c);assert.throws(()=>writeDenied.save(emptyWorkspace(c)),/quota/);assert.equal(writeDenied.locked,true);});
test('safe CSV including whitespace formulas, current/cleared notes and unresolved rows',()=>{for(const x of ['=1',' +1','\t@cmd','\n -2','\r=3'])assert.ok(csvCell(x).startsWith('"\''));assert.equal(csvCell('a"b'),'"a""b"');const w=emptyWorkspace(c);w.name=' =collection';w.note='@new';w.lines=[{id:material.id,quantity:'1',note:' +latest'}];let csv=workspaceCsv(w,c);assert.match(csv,/' =collection/);assert.match(csv,/'@new/);assert.match(csv,/' \+latest/);w.note='';w.lines[0].note='';csv=workspaceCsv(w,c);assert.doesNotMatch(csv,/latest|@new/);});
test('catalog production validator rejects corrupted money, duplicate IDs and staffel semantics',()=>{for(const mutate of [x=>x.positions[0].price.cells.reverse(),x=>x.positions[0].price.cells[0].chf='nan',x=>x.positions[0].price.cells[0].quantity='0',x=>x.positions[0].source.pdf_page=35,x=>x.positions.push(x.positions[0]),x=>x.positions[0].rule_ids=['missing']]){const x=structuredClone(c);mutate(x);assert.throws(()=>validateCatalog(x));}});

// Execute the unchanged production ESM and its registered handlers offline. This
// deliberately models DOM identity/focus, not native keyboard events or layout.
if(typeof vm.SourceTextModule!=='function'){
 test('bookmark real handlers (offline VM subprocess)',t=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT; // A fresh runner, not a recursive node:test child.
  const r=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-name-pattern=^bookmark ',fileURLToPath(import.meta.url)],{env,encoding:'utf8',maxBuffer:4*1024*1024});
  t.diagnostic(r.stdout);if(r.stderr)t.diagnostic(r.stderr);
  assert.ifError(r.error);assert.equal(r.signal,null);assert.equal(r.status,0,'real-handler regressions must pass');
  assert.match(r.stdout,/# tests 27\b/,'all registered bookmark cases must actually execute');assert.match(r.stdout,/# pass 27\b/);assert.doesNotMatch(r.stdout,/skipping running files|not ok /);
 });
}else{
 const appUrl=new URL('../src/app.js',import.meta.url),source=await readFile(appUrl,'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const data={};for(const name of ['catalog.json','source-pages.json','provenance.json','import-report.json'])data[name]=JSON.parse(await readFile(new URL('../public/data/'+name,import.meta.url),'utf8'));
 const descendants=e=>e.children.flatMap(n=>[n,...descendants(n)]),rows=f=>f.get('results').children.filter(e=>e.className==='result-row'),star=row=>row.children[0];
 const ids=f=>rows(f).map(row=>row.dataset.id);
 const sameNodes=(actual,expected)=>assert.ok(actual.length===expected.length&&actual.every((node,i)=>node===expected[i]),'same DOM/control identities in the same order');
 const workspaceWith=positions=>({...emptyWorkspace(c),favorites:positions.map(p=>p.id).reverse()});
 function label(button,p,on){assert.equal(button.textContent,on?'★':'☆');assert.equal(button.getAttribute('aria-pressed'),String(on));assert.equal(button.getAttribute('aria-label'),(on?'Aus Merkliste entfernen: ':'Merken: ')+p.title);}
 function count(f,total,shown){assert.equal(f.get('result-count').textContent,`${total} Treffer im vollständigen Katalog (917 Quellzeilen) · ${shown} angezeigt`);assert.equal(f.get('more').hidden,total===shown);}
 async function fixture({workspace=null,raw=workspace===null?null:' \n'+JSON.stringify(workspace)+'  ',fault=''}={}){
  const work={created:0,replaced:[],removed:[],focused:[],attempts:[],writes:[],reads:[],filters:0};let doc;
  class Element{
   constructor(tag,id=''){Object.assign(this,{tag,id,children:[],parentElement:null,_text:'',className:'',dataset:{},attrs:{},listeners:{},value:'',checked:false,disabled:false,hidden:false,open:false});work.created++;}
   get isConnected(){return this===doc.body||Boolean(this.parentElement?.isConnected);}
   get textContent(){return this._text+this.children.map(e=>e.textContent).join('');}
   set textContent(value){this.detachChildren();this._text=String(value);}
   contains(e){return e===this||this.children.some(n=>n.contains(e));}
   detachChildren(){for(const child of [...this.children])child.detach();}
   detach(){if(!this.parentElement)return;if(this.contains(doc.activeElement))doc.activeElement=doc.body;this.parentElement.children=this.parentElement.children.filter(e=>e!==this);this.parentElement=null;}
   append(...nodes){for(const n of nodes){if(n.tag==='#fragment'){this.append(...n.children);continue;}n.detach();n.parentElement=this;this.children.push(n);}}
   replaceChildren(...nodes){work.replaced.push(this);this.detachChildren();this._text='';this.append(...nodes);}
   remove(){work.removed.push(this);this.detach();}
   setAttribute(key,value){this.attrs[key]=String(value);}
   getAttribute(key){return this.attrs[key]??null;}
   addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
   async fire(type,event={}){for(const fn of this.listeners[type]??[])await fn({target:this,...event});await new Promise(resolve=>setImmediate(resolve));}
   click(){return this.disabled?Promise.resolve():this.fire('click');}
   focus(){assert.ok(this.isConnected,'cannot focus detached control');work.focused.push(this);doc.activeElement=this;}
   querySelectorAll(selector){assert.equal(selector,'.favorite');return descendants(this).filter(e=>e.className==='favorite');}
   showModal(){this.open=true;}
   close(){this.open=false;return this.fire('close');}
  }
  doc={body:new Element('body')};doc.activeElement=doc.body;const nodes=new Map();
  for(const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){
   const e=new Element(m[1],m[3]);e.disabled=/\sdisabled(?:\s|$)/.test(m[2]);e.hidden=/\shidden(?:\s|$)/.test(m[2]);nodes.set(e.id,e);doc.body.append(e);
  }
  const get=id=>{assert.ok(nodes.has(id),'real HTML control '+id);return nodes.get(id);};
  Object.assign(doc,{getElementById:get,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('#fragment'),querySelectorAll(selector){assert.equal(selector,'[data-close]');return [];}});
  const sentinels=new Map(Array.from({length:8},(_,i)=>['foreign.workspace.'+i,' synthetic raw '+i+' \n'])),store=new Map(sentinels);if(raw!==null)store.set(STORAGE_KEY,raw);
  const storage={getItem(key){work.reads.push(key);if(fault==='unreadable')throw Error('synthetic read denial');return store.get(key)??null;},setItem(key,value){work.attempts.push({key,value});assert.equal(key,STORAGE_KEY);if(fault==='quota')throw Error('synthetic quota');if(fault==='readback')return;work.writes.push({key,value});store.set(key,value);}};
  const events={},window={localStorage:storage,addEventListener(type,fn){(events[type]??=[]).push(fn);},confirm:()=>true,print(){throw Error('unexpected native print call');}};
  const context=vm.createContext({document:doc,window,URL,Blob,structuredClone,console,setTimeout(){throw Error('unexpected timer/download');},fetch:async url=>{const name=new URL(url).pathname.split('/').at(-1);assert.ok(Object.hasOwn(data,name),'packaged fetch only');return {ok:true,json:async()=>structuredClone(data[name])};}});
  const exports={...domain,filterPositions(...args){work.filters++;return filterPositions(...args);}};
  const app=new vm.SourceTextModule(source,{context,initializeImportMeta(meta){meta.url=appUrl.href;}});
  await app.link(specifier=>{assert.equal(specifier,'./domain.js');return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);},{context});});await app.evaluate();
  for(let i=0;i<20&&doc.body.dataset.ready!=='true';i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(doc.body.dataset.ready,'true','actual app bootstraps with real source package');assert.equal(work.attempts.length,0,'startup never writes');
  return {get,doc,work,store,storage,raw,assertForeign(){for(const [key,value] of sentinels)assert.equal(store.get(key),value);assert.equal(store.size,sentinels.size+(store.has(STORAGE_KEY)?1:0));},async input(id,value){get(id).value=value;await get(id).fire('input');},async favorites(){get('favorites-only').checked=true;await get('favorites-only').fire('change');},async emit(type,event={}){for(const fn of events[type]??[])await fn(event);}};
 }
 for(const shown of [40,80,917])test(`bookmark nonfiltered ${shown}-row prefix preserves every control and repeat-toggle state`,async()=>{
  const f=await fixture();while(rows(f).length<shown)await f.get('more').click();
  const before=rows(f),controls=descendants(f.get('results')),plan=descendants(f.get('plan-lines')),p=c.positions[7],button=star(before[7]);button.focus();
  const created=f.work.created,replaced=f.work.replaced.length,filters=f.work.filters;
  for(const on of [true,false,true,false]){
   const reads=f.work.reads.length,writes=f.work.writes.length;await button.click();
   assert.equal(button.isConnected,true,'initiating star remains connected');assert.equal(f.doc.activeElement,button,'initiating star keeps focus');label(button,p,on);
   sameNodes(rows(f),before);sameNodes(descendants(f.get('results')),controls);sameNodes(descendants(f.get('plan-lines')),plan);
   assert.deepEqual(ids(f),c.positions.slice(0,shown).map(p=>p.id));count(f,917,shown);
   assert.equal(f.work.created,created,'no new elements');assert.equal(f.work.replaced.length,replaced,'no subtree replacements');assert.equal(f.work.filters,filters,'no unchanged result filtering');
   assert.equal(f.work.writes.length,writes+1,'one synchronous persistence');assert.equal(f.work.reads.length,reads+2,'raw compare and exact readback still run');
   assert.deepEqual(JSON.parse(f.store.get(STORAGE_KEY)).favorites,on?[p.id]:[]);f.assertForeign();
  }
  if(shown===80){await f.get('more').click();assert.deepEqual(ids(f),c.positions.slice(0,120).map(p=>p.id));count(f,917,120);}
 });
 test('bookmark nonfiltered activation does not steal unrelated focus',async()=>{
  const f=await fixture();f.get('search').focus();const focused=f.work.focused.length;await star(rows(f)[0]).click();assert.equal(f.doc.activeElement,f.get('search'));assert.equal(f.work.focused.length,focused);label(star(rows(f)[0]),c.positions[0],true);
 });
 for(const [name,at,size] of [['first',0,4],['middle',1,4],['last',3,4],['only',0,1]])test(`bookmark favorites-only ${name} removal preserves survivors and deliberate focus`,async()=>{
  const positions=[c.positions[6],c.positions[90],c.positions[400],c.positions[916]].slice(0,size),w=workspaceWith(positions),f=await fixture({workspace:w});await f.favorites();
  const before=rows(f),removed=before[at],button=star(removed),survivors=before.filter(row=>row!==removed),controls=survivors.flatMap(descendants);button.focus();
  const replaced=f.work.replaced.length,created=f.work.created;await button.click();
  assert.deepEqual(ids(f),positions.filter((_,i)=>i!==at).map(p=>p.id));sameNodes(rows(f),survivors);sameNodes(rows(f).flatMap(descendants),controls);assert.equal(removed.isConnected,false);
  assert.equal(f.work.replaced.length,replaced,'do not replace surviving result DOM');assert.equal(f.work.created-created,size===1?2:1,'only fragment and optional empty message are created');
  const target=survivors[Math.min(at,survivors.length-1)];assert.ok(f.doc.activeElement===(target?star(target):f.get('favorites-only')),'focus next/previous star or empty-filter fallback');
  for(const row of survivors)label(star(row),byId.get(row.dataset.id),true);count(f,size-1,size-1);
  if(size===1)assert.match(f.get('results').textContent,/Keine Positionen/);
  assert.equal(f.work.writes.length,1);assert.deepEqual(JSON.parse(f.store.get(STORAGE_KEY)),{...w,favorites:w.favorites.filter(id=>id!==positions[at].id)});f.assertForeign();
 });
 for(const [size,shown,at] of [[917,80,0],[917,80,39],[917,80,79],[41,40,39]])test(`bookmark filtered removal ${at}/${shown}/${size} refills only the current prefix`,async()=>{
  const positions=c.positions.slice(0,size),f=await fixture({workspace:workspaceWith(positions)});await f.favorites();while(rows(f).length<shown)await f.get('more').click();
  const before=rows(f),removed=before[at],button=star(removed);button.focus();const replaced=f.work.replaced.length;await button.click();
  const expected=positions.filter(p=>p.id!==removed.dataset.id);assert.deepEqual(ids(f),expected.slice(0,shown).map(p=>p.id));count(f,size-1,shown);
  for(const old of before.filter(row=>row!==removed))assert.ok(rows(f).find(row=>row.dataset.id===old.dataset.id)===old,'surviving row identity');
  assert.equal(f.work.replaced.length,replaced);assert.ok(f.doc.activeElement===star(rows(f)[at]),'focus the next matching star');assert.equal(rows(f).at(-1).dataset.id,positions[shown].id,'next full-corpus match fills the vacancy');
  if(size===917){await f.get('more').click();assert.deepEqual(ids(f),expected.slice(0,120).map(p=>p.id));count(f,916,120);}f.assertForeign();
 });
 for(const owner of ['search','favorites-only','other-star','other-main','other-add','plan-note'])test(`bookmark filtered removal leaves ${owner} focus alone`,async()=>{
  const f=await fixture({workspace:workspaceWith(c.positions.slice(0,3))});await f.favorites();const before=rows(f),active=owner.startsWith('other-')?before[2].children[{'other-star':0,'other-main':1,'other-add':2}[owner]]:f.get(owner);active.focus();
  const focused=f.work.focused.length;await star(before[0]).click();assert.ok(f.doc.activeElement===active,'only the initiating focused star owns focus recovery');assert.equal(active.isConnected,true);assert.equal(f.work.focused.length,focused);f.assertForeign();
 });
 test('bookmark empty filtered removal does not steal plan focus',async()=>{
  const f=await fixture({workspace:workspaceWith(c.positions.slice(0,1))});await f.favorites();f.get('plan-note').focus();await star(rows(f)[0]).click();assert.equal(f.doc.activeElement,f.get('plan-note'));count(f,0,0);
 });
 test('bookmark full-corpus search and combined filters retain exact matching source order',async()=>{
  const p=c.positions.findLast(p=>p.flags.length),f=await fixture();assert.ok(c.positions.indexOf(p)>40);await f.input('search',p.id);
  for(const [id,value] of [['section',p.section],['kind',p.price.kind],['flag',p.flags[0]]]){f.get(id).value=value;await f.get(id).fire('change');}
  assert.deepEqual(ids(f),[p.id]);const row=rows(f)[0];await star(row).click();assert.ok(rows(f)[0]===row,'matching filtered row survives nonfiltered star toggle');count(f,1,1);await f.favorites();assert.deepEqual(ids(f),[p.id]);star(rows(f)[0]).focus();await star(rows(f)[0]).click();assert.deepEqual(ids(f),[]);count(f,0,0);assert.ok(f.doc.activeElement===f.get('favorites-only'));f.assertForeign();
 });
 test('bookmark real valid/invalid quantity drafts, open prices and fresh beforeprint remain intact',async()=>{
  const service=c.positions.find(p=>p.code==='A.2.c'),open=c.positions.find(p=>p.price.kind==='unpriced'),w=workspaceWith(c.positions.slice(0,3));w.lines=[material,service,open].map(p=>({id:p.id,quantity:'1',note:'original note'}));
  const f=await fixture({workspace:w}),plan=f.get('plan-lines'),controls=descendants(plan),inputs=controls.filter(e=>e.tag==='input'),notes=controls.filter(e=>e.tag==='textarea');
  await f.emit('beforeprint');assert.match(f.get('print-area').textContent,/original note/);
  inputs[0].value='3,21';await inputs[0].fire('input');inputs[1].value='1.5';await inputs[1].fire('input');notes[0].value='';await notes[0].fire('input');
  assert.equal(inputs[1].getAttribute('aria-invalid'),'true');assert.equal(f.get('total').textContent,'CHF 0.35');assert.match(f.get('total-status').textContent,/UNVOLLSTÄNDIG: 2/);
  const rawBefore=JSON.parse(f.store.get(STORAGE_KEY));assert.equal(rawBefore.lines[0].quantity,'3,21');assert.equal(rawBefore.lines[1].quantity,'1');
  await star(rows(f)[0]).click();await f.favorites();star(rows(f)[0]).focus();await star(rows(f)[0]).click();
  sameNodes(descendants(plan),controls);assert.equal(inputs[0].value,'3,21');assert.equal(inputs[1].value,'1.5');assert.equal(inputs[1].getAttribute('aria-invalid'),'true');assert.equal(notes[0].value,'');
  assert.deepEqual(JSON.parse(f.store.get(STORAGE_KEY)).lines,rawBefore.lines);const writes=f.work.writes.length;await f.emit('beforeprint');assert.match(f.get('print-area').textContent,/Keine gültige Druckansicht/);assert.doesNotMatch(f.get('print-area').textContent,/CHF|original note/);assert.equal(f.work.writes.length,writes);
  await f.get('export-json').click();assert.match(f.get('status').textContent,/ganze Zahl/);
  inputs[1].value='2';await inputs[1].fire('input');await f.input('plan-name','current print name');await f.input('plan-note','current print note');
  const beforePrint=f.store.get(STORAGE_KEY),attempts=f.work.attempts.length;await f.emit('beforeprint');assert.equal(f.get('total').textContent,'CHF 3.50');assert.match(f.get('total-status').textContent,/UNVOLLSTÄNDIG: 1/);assert.match(f.get('print-area').textContent,/current print name.*current print note/s);assert.match(f.get('print-area').textContent,/UNVOLLSTÄNDIGE Teilsumme: CHF 3.50/);assert.match(f.get('print-area').textContent,/offen/);assert.equal(f.store.get(STORAGE_KEY),beforePrint);assert.equal(f.work.attempts.length,attempts);f.assertForeign();
 });
 for(const mode of ['corrupt','unreadable','quota','silent-change','storage-event','readback'])test(`bookmark protected ${mode} storage keeps raw bytes and local interaction`,async()=>{
  const w=workspaceWith(c.positions.slice(0,2)),f=await fixture({workspace:w,...(mode==='corrupt'?{raw:' \n{broken storage  '}:{fault:mode})});
  if(mode==='silent-change')f.store.set(STORAGE_KEY,' external exact bytes \n');
  if(mode==='storage-event')await f.emit('storage',{key:STORAGE_KEY,storageArea:f.storage});
  const protectedRaw=f.store.get(STORAGE_KEY),before=rows(f),button=star(before[0]);button.focus();await button.click();assert.ok(rows(f)[0]===before[0],'protected local toggle preserves row identity');assert.ok(f.doc.activeElement===button);label(button,c.positions[0],['corrupt','unreadable'].includes(mode));
  assert.equal(f.get('storage-warning').hidden,false);assert.match(f.get('save-state').textContent,/Speichern pausiert/);assert.equal(f.store.get(STORAGE_KEY),protectedRaw);assert.equal(f.work.writes.length,0);assert.equal(f.work.attempts.length,['quota','readback'].includes(mode)?1:0);
  await f.favorites();const filtered=rows(f);assert.equal(filtered.length,1);star(filtered[0]).focus();await star(filtered[0]).click();count(f,0,0);assert.equal(f.doc.activeElement,f.get('favorites-only'));assert.equal(f.store.get(STORAGE_KEY),protectedRaw);assert.equal(f.work.writes.length,0);f.assertForeign();
 });
}
