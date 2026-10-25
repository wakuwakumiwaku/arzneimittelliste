#!/usr/bin/env node
/** Native acceptance, deliberately separate from npm test. No product calculator/filter imports.
 * npm run test:browser -- --self-test is browser-free. Actual runs require external
 * PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE (Firefox / Camoufox); no shared profile.
 */
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {createAppServer} from '../scripts/serve.mjs';
import {runtimeFiles} from '../scripts/files.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const KEY='arzneimittelliste.workspace.v1';
const SOURCE='73a82c5e4dff4a7249c5e9db0c8c6918d006e847949ca4de4ef894c99fc78d2c';
const BASE='/arzneimittelliste/';
const catalog=JSON.parse(await readFile(path.join(ROOT,'public/data/catalog.json'),'utf8'));
const sourcePages=JSON.parse(await readFile(path.join(ROOT,'public/data/source-pages.json'),'utf8'));
const provenance=JSON.parse(await readFile(path.join(ROOT,'public/data/provenance.json'),'utf8'));
const positions=catalog.positions;
const lookup=new Map(positions.map(p=>[p.id,p]));
const exactTitle=title=>{const found=positions.filter(p=>p.title===title);assert.equal(found.length,1,title);return found[0];};
const material=exactTitle('Absinthii herba Ph. Eur.');
const capsule=exactTitle('Gelatinekapseln No 00: 25 Stück');
const ivermectin=exactTitle('Ivermectinum Ph. Eur.');
const miconazol=exactTitle('Miconazolum Ph. Eur.');
const miconazolNitras=exactTitle('Miconazoli nitras Ph. Eur.');
const midazolam=exactTitle('Midazolamum hydrochloridum DAC');
const service=positions.find(p=>p.code==='A.2.c');
const serviceBlock=positions.find(p=>p.code==='A.2.d');
const serviceNextBlock=positions.find(p=>p.code==='A.2.e');
const codeExample=positions.find(p=>p.code==='A.1.a');
const blood=positions.find(p=>p.section==='blood'&&p.title.startsWith('Erythrozyten'));
const reference=positions.find(p=>p.price.kind==='reference_only');
const unpriced=positions.find(p=>p.price.kind==='unpriced');
const LABELS={graduated_chf:'Mengenstaffel · CHF exkl. MWST',fixed_chf:'Fixbetrag · CHF exkl. MWST',taxpoints:'Taxpunkte · CHF 1.05/TP exkl. MWST',reference_only:'Sondereinheit · Berechnung offen',unpriced:'Ohne Preis · Verweis'};
const OTHER_KEYS=['dentotar.workspace.v1','migel.workspace.v1','sl.workspace.v1','analysenliste.workspace.v1','pflegefinanzierung.workspace.v1','arzttarife.workspace.v1','physiotherapie.workspace.v1','spitaltarife.workspace.v1'];
const SENTINELS=Object.fromEntries(OTHER_KEYS.map((k,i)=>[k,`  native-sentinel:${i}:${k}\n\t{"uninterpreted":true}  `]));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=value=>structuredClone(value);
const empty=()=>({app:'arzneimittelliste.workspace',version:1,edition:'2026-07-01',sourceSha256:SOURCE,name:'Meine Zusammenstellung',note:'',lines:[],favorites:[]});
const line=(p,quantity='1',note='')=>({id:p.id,quantity,note});
const seeded=(lines=[line(material)],favorites=[material.id])=>({...empty(),name:'Nativer Ausgangsentwurf',note:'Ausgangsnotiz',lines,favorites});
// Independent raw-data oracle. Deliberately does not call production searchIndex/filterPositions.
const fold=value=>String(value).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('de-CH').replaceAll('ß','ss');
function oracle({query='',section='',kind='',flag='',favoritesOnly=false,favorites=[]}={}){
 const words=fold(query).match(/\S+/gu)||[];
 return positions.filter(p=>{
  if(section&&p.section!==section||kind&&p.price.kind!==kind||flag&&!p.flags.includes(flag)||favoritesOnly&&!favorites.includes(p.id))return false;
  const row=[p.id,p.code,p.title,p.unit,p.notes,p.hierarchy.join(' '),p.flags.join(' '),LABELS[p.price.kind],...p.rule_ids.map(id=>catalog.rules.find(r=>r.id===id).text)].map(fold).join(' ');
  return words.every(word=>row.includes(word));
 }).map(p=>p.id);
}
function chf(cents){if(cents===null)return 'offen';const n=BigInt(cents);return 'CHF '+(n/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'’')+'.'+(n%100n).toString().padStart(2,'0');}
// Known answers from actual PDF p8 cells 1g=10Rp,10g=40Rp,100g=350Rp and p4–5.
// 3.2g =>32Rp=>30; 3.21g=>32.1Rp=>35; 3.7=>37=>35; 3.71=>37.1=>40.
// 9g is capped at next 40Rp; 12g =>48Rp=>50; 500g=>4.5*350=1575;
// 1000g=>8*350=2800. Non-explicit multiples >=5*100 remain unresolved.
const MATERIAL_CASES=[['0.000001',10],['1',10],['3.2',30],['3.21',35],['3.7',35],['3.71',40],['9',40],['12',50],['500',1575],['1000',2800],['501',null],['600',null],['900',null],['1001',null]];
// CSV reader is test-owned, supports BOM, quotes, semicolons and multiline notes.
function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;const s=text.replace(/^\uFEFF/u,'');
 for(let i=0;i<s.length;i++){
  const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===';'&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 assert.equal(quoted,false,'closed CSV quoting');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
const safeCsv=value=>/^[\s]*[=+\-@]/u.test(value)||/^[\t\r]/u.test(value)?"'"+value:value;
function malformedFixtures(valid){
 const changed=fn=>{const v=clone(valid);fn(v);return v;};
 return [
  ['top-null',null],['top-array',[]],['top-string','workspace'],['top-number',7],['top-boolean',false],
  ['wrong-app',changed(v=>v.app='other')],['version-number',changed(v=>v.version=2)],['version-string',changed(v=>v.version='1')],
  ['edition',changed(v=>v.edition='2026-01-01')],['source-hash',changed(v=>v.sourceSha256='0'.repeat(64))],
  ['unknown-top-field',changed(v=>v.extra=true)],['name-array',changed(v=>v.name=[])],['note-object',changed(v=>v.note={})],
  ['lines-object',changed(v=>v.lines={})],['favorites-object',changed(v=>v.favorites={})],
  ...[['array',[]],['object',{}],['number',123],['null',null],['boolean',true],['unknown','not-an-alt-id']].map(([name,id])=>['later-line-id-'+name,changed(v=>v.lines[1].id=id)]),
  ['later-line-null',changed(v=>v.lines[1]=null)],['later-line-array',changed(v=>v.lines[1]=[])],
  ['later-line-quantity-number',changed(v=>v.lines[1].quantity=1)],['later-line-quantity-zero',changed(v=>v.lines[1].quantity='0')],
  ['later-line-quantity-exponent',changed(v=>v.lines[1].quantity='1e2')],['later-line-quantity-overlimit',changed(v=>v.lines[1].quantity='1000001')],
  ['later-line-decimal-block',changed(v=>v.lines[1]={...line(service),quantity:'1.5'})],
  ['later-line-note-array',changed(v=>v.lines[1].note=[])],['later-line-extra',changed(v=>v.lines[1].extra=1)],
  ['duplicate-lines',changed(v=>v.lines[1]=clone(v.lines[0]))],
  ['favorite-array-id',changed(v=>v.favorites=[[material.id]])],['favorite-object-id',changed(v=>v.favorites=[{}])],
  ['favorite-primitive-number',changed(v=>v.favorites=[1])],['favorite-unknown',changed(v=>v.favorites=['not-an-alt-id'])],
  ['duplicate-favorites',changed(v=>v.favorites=[material.id,material.id])]
 ];
}
function offlineSelfTest(){
 assert.equal(positions.length,917);assert.equal(lookup.size,917);assert.equal(catalog.source_sha256,SOURCE);
 assert.deepEqual(Object.fromEntries(Object.keys(LABELS).map(k=>[k,positions.filter(p=>p.price.kind===k).length])),{graduated_chf:817,fixed_chf:49,taxpoints:31,reference_only:4,unpriced:16});
 assert.equal(sourcePages.pages.length,34);assert.deepEqual(sourcePages.pages.map(p=>p.page),Array.from({length:34},(_,i)=>i+1));
 assert.deepEqual(material.price.cells.map(c=>[c.quantity,c.chf]),[['1','0.10'],['10','0.40'],['100','3.50']]);
 assert.equal(service.price.points,'1.5');assert.equal(service.price.chf_per_point,'1.05');assert.equal(serviceBlock.price.points,'24');assert.equal(serviceNextBlock.price.points,'12');
 assert.equal(capsule.price.chf,'9.10');assert.equal(blood.price.chf,'299.45');assert.equal(blood.price.manufacturer_chf,'267.37');
 assert.equal(codeExample.code,'A.1.a');assert.equal(midazolam.price.cells.find(c=>c.quantity==='0.001').chf,'0.10');
 assert.equal(oracle().length,917);assert.equal(oracle({query:capsule.id})[0],capsule.id);assert.ok(positions.indexOf(capsule)>40);
 assert.equal(oracle({query:'Versorgungsengpässe'}).length,917);assert.ok(!positions.some(p=>fold(p.title).includes('versorgungsengpasse')));
 assert.equal(oracle({section:'II',kind:'taxpoints'}).length,31);assert.deepEqual(oracle({favoritesOnly:true,favorites:[capsule.id]}),[capsule.id]);
 assert.deepEqual(parseCsv('\uFEFF"a;b";"x""y"\r\n"two\nlines";""\r\n'),[['a;b','x"y'],['two\nlines','']]);
 for(const s of ['  =a','\n @b',' \t+c','\r-d'])assert.equal(safeCsv(s),"'"+s);
 const malformed=malformedFixtures(seeded([line(material),line(capsule)]));assert.equal(new Set(malformed.map(([n])=>n)).size,malformed.length);
 assert.ok(MATERIAL_CASES.length>=14);assert.equal(35+910+10,955);assert.equal(chf(955),'CHF 9.55');
 for(const p of [material,capsule,ivermectin,miconazol,miconazolNitras,midazolam,service,serviceBlock,serviceNextBlock,blood,reference,unpriced,codeExample])assert.ok(p?.id);
 console.log(JSON.stringify({mode:'browser-free-self-test',rows:917,pages:34,malformedFixtures:malformed.length,materialAnswers:MATERIAL_CASES.length,status:'passed',nativeBrowserExecuted:false}));
}
if(process.argv.includes('--self-test')){offlineSelfTest();process.exit(0);}
if(process.argv.length>2)throw Error('Only --self-test is supported.');
if(!process.env.PLAYWRIGHT_MODULE||!process.env.BROWSER_EXECUTABLE)throw Error('Set PLAYWRIGHT_MODULE (external Playwright ESM entry) and BROWSER_EXECUTABLE (owned Firefox/Camoufox executable). No browser was launched.');

const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
const artifacts=path.join(ROOT,'.local/browser',runId);
await mkdir(path.join(artifacts,'downloads'),{recursive:true});
await mkdir(path.join(artifacts,'screenshots'),{recursive:true});
const originals={stdout:process.stdout.write.bind(process.stdout),stderr:process.stderr.write.bind(process.stderr)};
for(const stream of ['stdout','stderr'])process[stream].write=function(chunk,...args){appendFileSync(path.join(artifacts,stream+'.log'),Buffer.isBuffer(chunk)?chunk:String(chunk));return originals[stream](chunk,...args);};
const report={runId,mode:'native-firefox-acceptance',startedAt:new Date().toISOString(),status:'running',nativeBrowserExecuted:false,printBoundary:'window.print instrumented; NOT an actual OS print dialog',remoteDestinations:'configured links only; never activated, no live-availability claim',assertions:[],scenarios:[],events:[],violations:[],downloads:[],screenshots:[],timings:[],inputs:{},artifacts:path.relative(ROOT,artifacts)};
let server,browser,origin,url,currentScenario='setup',downloadSerial=0;
const contexts=new Set();
function logEvent(event){const record={at:new Date().toISOString(),scenario:currentScenario,...event};report.events.push(record);appendFileSync(path.join(artifacts,'events.jsonl'),JSON.stringify(record)+'\n');}
function bad(event){report.violations.push({scenario:currentScenario,...event});logEvent({...event,unexpected:true});}
function verify(name,fn){try{fn();report.assertions.push({scenario:currentScenario,name,status:'passed'});}catch(error){report.assertions.push({scenario:currentScenario,name,status:'failed',error:error.stack});throw error;}}
const eq=(name,actual,expected)=>verify(name,()=>assert.deepEqual(actual,expected));
const ok=(name,value)=>verify(name,()=>assert.ok(value));
const text=(page,selector)=>page.locator(selector).textContent();
const raw=page=>page.evaluate(k=>window.__nativeProbe.read(k),KEY);
const state=async page=>JSON.parse(await raw(page));
const ids=page=>page.locator('#results .result-row[data-id]').evaluateAll(rows=>rows.map(r=>r.dataset.id));
const planRow=(page,p)=>page.locator(`#plan-lines [data-plan-id="${p.id}"]`);
const quantityInput=(page,p)=>planRow(page,p).locator('input[type="text"]');
async function screenshot(page,name){const relative='screenshots/'+name+'.png';await page.screenshot({path:path.join(artifacts,relative),fullPage:false});report.screenshots.push({scenario:currentScenario,file:relative,url:page.url(),viewport:page.viewportSize(),sha256:sha(await readFile(path.join(artifacts,relative)))});}
async function actualDownload(page,selector,label){
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);
 const filename=download.suggestedFilename();const relative=`downloads/${String(++downloadSerial).padStart(3,'0')}-${label}-${filename.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
 await download.saveAs(path.join(artifacts,relative));eq(label+' native download failure',await download.failure(),null);
 const bytes=await readFile(path.join(artifacts,relative));ok(label+' actual nonempty bytes',bytes.length>0);
 report.downloads.push({scenario:currentScenario,file:relative,suggestedFilename:filename,bytes:bytes.length,sha256:sha(bytes)});
 return {bytes,text:bytes.toString('utf8'),filename};
}
async function assertSentinels(page,label){const actual=await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,window.__nativeProbe.read(k)])),OTHER_KEYS);eq(label+' eight foreign namespaces byte-exact',actual,SENTINELS);}
function monitor(page){
 if(page.__nativeMonitored)return;page.__nativeMonitored=true;page.__downloads=[];
 page.on('download',d=>{page.__downloads.push(d.suggestedFilename());logEvent({type:'download',filename:d.suggestedFilename(),url:d.url()});});
 page.on('console',m=>{const event={type:'console',level:m.type(),text:m.text(),location:m.location(),page:page.url()};if(['warning','error'].includes(m.type()))bad(event);else logEvent(event);});
 page.on('pageerror',e=>bad({type:'pageerror',text:e.stack||e.message,page:page.url()}));
 page.on('request',request=>{
  const event={type:'request',method:request.method(),url:request.url(),resourceType:request.resourceType()};logEvent(event);
  if(!['GET','HEAD'].includes(request.method()))bad({...event,type:'unexpected-method'});
  const target=new URL(request.url());if(!['blob:','data:','about:'].includes(target.protocol)&&target.origin!==origin)bad({...event,type:'external-fetch'});
 });
 page.on('requestfailed',r=>bad({type:'requestfailed',url:r.url(),method:r.method(),failure:r.failure()}));
 page.on('response',r=>{logEvent({type:'response',url:r.url(),status:r.status()});if(r.status()>=400)bad({type:'http-failure',url:r.url(),status:r.status()});});
 page.on('crash',()=>bad({type:'page-crash',page:page.url()}));
}
async function newContext({workspace,rawValue,readBlocked=false,writeFault=null,width=1440}={}){
 const values={...SENTINELS};if(rawValue!==undefined)values[KEY]=rawValue;else if(workspace!==undefined)values[KEY]=JSON.stringify(workspace);
 const context=await browser.newContext({viewport:{width,height:960},acceptDownloads:true,locale:'de-CH',colorScheme:'dark',reducedMotion:'reduce',serviceWorkers:'block',storageState:{cookies:[],origins:[{origin,localStorage:Object.entries(values).map(([name,value])=>({name,value}))}]}});
 contexts.add(context);context.setDefaultTimeout(12000);context.setDefaultNavigationTimeout(20000);context.on('page',monitor);
 // Never contact a remote destination, even if an unexpected product request occurs.
 await context.route('**/*',async route=>{const target=new URL(route.request().url());if(['http:','https:'].includes(target.protocol)&&target.origin!==origin){bad({type:'blocked-external-fetch',url:target.href,method:route.request().method()});await route.abort('blockedbyclient');}else await route.continue();});
 // Faults affect ONLY the app's key in this disposable context. Native methods are
 // retained solely for byte inspection; no production error is suppressed.
 await context.addInitScript(({key,readBlocked,writeFault})=>{
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  const faults=[];window.__nativeProbe={read:k=>get.call(localStorage,k),faults,prints:[],statusRevision:0};
  Storage.prototype.getItem=function(k){if(this===localStorage&&k===key&&readBlocked){faults.push({operation:'getItem',key:k,name:'SecurityError'});throw new DOMException('native-suite read blocked','SecurityError');}return get.call(this,k);};
  Storage.prototype.setItem=function(k,v){if(this===localStorage&&k===key&&writeFault){faults.push({operation:'setItem',key:k,name:writeFault,value:String(v)});throw new DOMException('native-suite '+writeFault,writeFault);}return set.call(this,k,v);};
  window.print=()=>window.__nativeProbe.prints.push({at:performance.now(),text:document.getElementById('print-area').textContent});
  document.addEventListener('DOMContentLoaded',()=>{const status=document.getElementById('status');if(status)new MutationObserver(()=>window.__nativeProbe.statusRevision++).observe(status,{childList:true,subtree:true,characterData:true});});
 },{key:KEY,readBlocked,writeFault});
 return context;
}
async function newPage(context){const page=await context.newPage();await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>document.body.dataset.ready==='true');return page;}
async function isolated(options,fn){
 const context=await newContext(options);let page,failure;
 try{page=await newPage(context);await fn(page,context);}catch(error){failure=error;page ||= context.pages().at(-1);}
 finally{
  if(page&&!page.isClosed()){
   try{await assertSentinels(page,'scenario final, including failure');}catch(error){failure=failure?new AggregateError([failure,error],'Scenario and namespace preservation failed'):error;}
   if(failure)await screenshot(page,currentScenario+'-failure').catch(error=>logEvent({type:'screenshot-failure',message:error.message}));
  }
  try{await context.close();contexts.delete(context);}catch(error){failure=failure?new AggregateError([failure,error],'Scenario and context cleanup failed'):error;}
 }
 if(failure)throw failure;
}
async function scenario(name,fn){currentScenario=name;const started=Date.now();try{await fn();report.scenarios.push({name,status:'passed',durationMs:Date.now()-started});console.log('PASS '+name);}catch(error){report.scenarios.push({name,status:'failed',durationMs:Date.now()-started,error:error.stack});console.error('FAIL '+name+'\n'+error.stack);}finally{await writeFile(path.join(artifacts,'results.json'),JSON.stringify(report,null,2)+'\n');}}
async function reset(page){await page.locator('#reset').click();}
async function search(page,query){await page.locator('#search').fill(query);}
async function showAll(page){let clicks=0;while(await page.locator('#more').isVisible()){await page.locator('#more').click();assert.ok(++clicks<=24,'finite 40-row pagination');}}
async function openRecord(page,p){await reset(page);await search(page,p.id);eq('record query exact single ID '+p.id,await ids(page),[p.id]);await page.locator(`#results [data-id="${p.id}"] .row-main`).click();await page.locator('#detail-dialog').waitFor({state:'visible'});}
async function closeDialog(page,id){await page.locator(`[data-close="${id}"]`).click();await page.locator('#'+id).waitFor({state:'hidden'});}
async function addRecord(page,p){await reset(page);await search(page,p.id);await page.locator(`#results [data-id="${p.id}"] .add`).click();eq('added native row '+p.id,await planRow(page,p).count(),1);}
async function setFilters(page,filters){
 await reset(page);if(filters.query)await search(page,filters.query);
 for(const key of ['section','kind','flag'])if(filters[key])await page.locator('#'+key).selectOption(filters[key]);
 if(filters.favoritesOnly)await page.locator('#favorites-only').check();
}
async function expectMatches(page,filters,favorites,label,all=false){
 await setFilters(page,filters);const expected=oracle({...filters,favorites});
 eq(label+' first DOM IDs',await ids(page),expected.slice(0,40));
 eq(label+' exact full-corpus count',await text(page,'#result-count'),`${expected.length} Treffer im vollständigen Katalog (917 Quellzeilen) · ${Math.min(40,expected.length)} angezeigt`);
 if(all){await showAll(page);eq(label+' all DOM IDs in source order',await ids(page),expected);}return expected;
}
async function setNotes(page,values,p=material){await page.locator('#plan-name').fill(values.name);await page.locator('#plan-note').fill(values.note);await planRow(page,p).locator('textarea').fill(values.lineNote);}
async function visibleDraft(page){return page.evaluate(()=>({name:document.querySelector('#plan-name').value,note:document.querySelector('#plan-note').value,lines:[...document.querySelectorAll('#plan-lines [data-plan-id]')].map(e=>({id:e.dataset.planId,quantity:e.querySelector('input').value,note:e.querySelector('textarea').value})),favorites:[...document.querySelectorAll('#results [aria-pressed="true"]')].map(e=>e.closest('[data-id]').dataset.id)}));}
async function upload(page,bytes,name='native.json'){
 const revision=await page.evaluate(()=>window.__nativeProbe.statusRevision);
 await page.locator('#import-file').setInputFiles({name,mimeType:'application/json',buffer:bytes});return revision;
}
async function rejectFile(page,bytes,label){
 const before=await raw(page),draft=await visibleDraft(page),downloads=page.__downloads.length;
 const revision=await upload(page,bytes,label+'.json');
 await page.waitForFunction(r=>window.__nativeProbe.statusRevision>r,revision);
 eq(label+' whole raw state unchanged',await raw(page),before);eq(label+' visible populated draft unchanged',await visibleDraft(page),draft);
 eq(label+' no preview',await page.locator('#import-dialog').isVisible(),false);eq(label+' no download',page.__downloads.length,downloads);
 ok(label+' visible rejection message',(await text(page,'#status')).length>0);
}
async function assertLocked(page,label){
 eq(label+' warning visible',await page.locator('#storage-warning').isVisible(),true);
 const caption=await text(page,'#save-state');ok(label+' truthful unsaved caption',/pausiert|Entwurf/.test(caption)&&!caption.includes('automatisch lokal gespeichert'));
}
async function geometry(page,label){
 const result=await page.evaluate(()=>{
  const active=document.querySelector('dialog[open]')||document.body;
  const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
  const tag=e=>e.id||e.className||e.tagName;
  const horizontal=[...active.querySelectorAll('*')].filter(e=>visible(e)&&!['INPUT','SELECT','OPTION','TEXTAREA','SVG','PATH'].includes(e.tagName)&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+1).map(e=>({element:tag(e),client:e.clientWidth,scroll:e.scrollWidth}));
  const controls=[...active.querySelectorAll('button,input:not([type="file"]),select,textarea,a,summary')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});
  const overlaps=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];if(a.contains(b)||b.contains(a))continue;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)overlaps.push([tag(a),tag(b)]);}
  const missed=controls.filter(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return hit!==e&&!e.contains(hit);}).map(tag);
  const fonts=selectors=>[...active.querySelectorAll(selectors)].filter(visible).map(e=>({element:tag(e),px:parseFloat(getComputedStyle(e).fontSize)}));
  return {viewport:innerWidth,document:{client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth},horizontal,overlaps,missed,fonts:fonts('.row-title,.line-title,button,input,select,textarea'),money:fonts('.price,.price-cell strong,.line-amount,#total'),source:fonts('.original,#source-text'),bg:getComputedStyle(document.documentElement).backgroundColor,fg:getComputedStyle(document.body).color,controlsMeasured:controls.length};
 });
 logEvent({type:'geometry',label,...result});ok(label+' no document horizontal overflow',result.document.scroll<=result.document.client+1);eq(label+' no internal horizontal overflow',result.horizontal,[]);eq(label+' no overlapping hit controls',result.overlaps,[]);eq(label+' unobscured native control centers',result.missed,[]);
 ok(label+' titles/forms/native buttons >=17px',result.fonts.every(f=>f.px>=17));ok(label+' monetary values >=18px',result.money.every(f=>f.px>=18));ok(label+' full source >=16px',result.source.every(f=>f.px>=16));
 eq(label+' dark violet background',result.bg,'rgb(7, 6, 11)');eq(label+' light foreground',result.fg,'rgb(250, 245, 255)');return result;
}

try{
 offlineSelfTest();
 for(const [target,source] of Object.entries(runtimeFiles)){
  const bytes=await readFile(path.join(ROOT,source));report.inputs[source]=sha(bytes);
  eq('built bytes equal immutable runtime '+target,sha(await readFile(path.join(ROOT,'dist',target))),sha(bytes));
 }
 const moduleSpecifier=process.env.PLAYWRIGHT_MODULE;
 const driver=await import(path.isAbsolute(moduleSpecifier)?pathToFileURL(moduleSpecifier).href:moduleSpecifier);
 const firefox=driver.firefox||driver.default?.firefox;assert.ok(firefox?.launch,'External module must export Playwright firefox');
 server=createAppServer({root:path.join(ROOT,'dist'),basePath:BASE});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 origin='http://127.0.0.1:'+server.address().port;url=origin+BASE;report.origin=origin;
 browser=await firefox.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 report.nativeBrowserExecuted=true;report.browserVersion=browser.version();

 await scenario('01-autoload-all-917-and-native-pagination',()=>isolated({},async page=>{
  eq('ready only after live activation',await page.locator('body').getAttribute('data-ready'),'true');
  eq('initial untouched absent app namespace',await raw(page),null);eq('initial 40 exact source rows',await ids(page),positions.slice(0,40).map(p=>p.id));
  eq('917 loaded count',await text(page,'#result-count'),'917 Treffer im vollständigen Katalog (917 Quellzeilen) · 40 angezeigt');
  let expected=40;while(await page.locator('#more').isVisible()){await page.locator('#more').click();expected=Math.min(expected+40,917);eq('native more exact source prefix '+expected,await ids(page),positions.slice(0,expected).map(p=>p.id));}
  eq('all source rows reachable',expected,917);eq('last real record reached',(await ids(page)).at(-1),capsule.id);await screenshot(page,'autoload-real-rows');
 }));

 await scenario('02-full-corpus-oracle-search-filter-favorites-reset',()=>isolated({},async page=>{
  const favoriteRecords=[material,midazolam,capsule,service,positions.find(p=>p.flags.includes('St'))];
  for(const p of favoriteRecords){await reset(page);await search(page,p.id);await page.locator(`[data-id="${p.id}"] .favorite`).click();}
  const favorites=favoriteRecords.map(p=>p.id);eq('native favorites saved', (await state(page)).favorites,favorites);
  const cases=[{query:capsule.title},{query:'Schlafstörungen'},{query:'Scabies'},{query:'HNO-Ärzte'},{query:'A.1.a'},
   ...catalog.sections.map(s=>({section:s.id})),...Object.keys(LABELS).map(kind=>({kind})),{flag:'L'},{flag:'St'},
   {section:'I',kind:'graduated_chf',flag:'L'},{query:'Midazolam',section:'I',kind:'graduated_chf',flag:'L',favoritesOnly:true},
   {kind:'taxpoints',favoritesOnly:true},{section:'III',kind:'fixed_chf',favoritesOnly:true},{flag:'St',favoritesOnly:true},{favoritesOnly:true},
   {section:'III',kind:'taxpoints'},{query:'native-no-such-source-row-xyz'}];
  for(const [i,filters] of cases.entries())await expectMatches(page,filters,favorites,'oracle '+i,true);
  eq('empty state explanatory text',await page.locator('#results .empty').isVisible(),true);
  await expectMatches(page,{query:'Versorgungsengpässe'},favorites,'rule-only term beyond first 40',true);
  await reset(page);eq('reset full first page',await ids(page),positions.slice(0,40).map(p=>p.id));
  eq('reset all controls',await page.evaluate(()=>['search','section','kind','flag'].map(id=>document.getElementById(id).value).concat(document.getElementById('favorites-only').checked)),['','','','',false]);
  await search(page,material.id);await page.locator(`[data-id="${material.id}"] .favorite`).click();eq('native favorite removal exact', (await state(page)).favorites,favorites.filter(id=>id!==material.id));
  for(const query of [capsule.id,'Versorgungsengpässe','Schlafstörungen','native-no-such-source-row-xyz']){
   await reset(page);await page.evaluate(()=>{window.__nativeTiming=null;document.querySelector('#search').addEventListener('input',()=>{const start=performance.now();requestAnimationFrame(()=>{window.__nativeTiming={query:document.querySelector('#search').value,inputToAnimationFrameMs:performance.now()-start,renderedCount:document.querySelectorAll('#results .result-row[data-id]').length,count:document.querySelector('#result-count').textContent};});},{once:true,capture:true});});
   await search(page,query);await page.waitForFunction(q=>window.__nativeTiming?.query===q,query);const measurement=await page.evaluate(()=>window.__nativeTiming);report.timings.push(measurement);
   eq('timed query actual rendered count '+query,measurement.renderedCount,Math.min(40,oracle({query}).length));ok('timing is actual finite duration '+query,Number.isFinite(measurement.inputToAnimationFrameMs)&&measurement.inputToAnimationFrameMs>=0);
  }
 }));

 await scenario('03-complete-native-details-rules-identifiers-and-all-34-pages',()=>isolated({},async page=>{
  for(const p of [material,capsule,service,blood,reference,unpriced,ivermectin,miconazol,miconazolNitras,midazolam,codeExample]){
   await openRecord(page,p);eq('full title '+p.id,await text(page,'#detail-title'),p.title);
   const detail=await text(page,'#detail-body');ok('internal ID explicitly labelled '+p.id,detail.includes('Interne Quellzeilen-ID: '+p.id));ok('actual source page '+p.id,detail.includes('PDF-Seite '+p.source.pdf_page));ok('actual price basis '+p.id,detail.includes(LABELS[p.price.kind]));
   if(p.code)ok('official source code distinct '+p.id,detail.includes('Quellcode '+p.code));else eq('no invented official billing code '+p.id,detail.includes('Quellcode '),false);
   if(p.notes)eq('complete original note '+p.id,await page.locator('#detail-body > pre.original').textContent(),p.notes);
   const cells=await page.locator('#detail-body .price-cell').allTextContents();eq('all source price columns '+p.id,cells,(p.price.cells||[]).map(c=>c.quantity+' '+p.unit+'CHF '+c.chf));
   for(const id of p.rule_ids){const rule=catalog.rules.find(r=>r.id===id),details=page.locator('#detail-body details').filter({has:page.locator('summary',{hasText:rule.title})});await details.locator('summary').click();eq('full rule '+p.id+'/'+id,await details.locator('pre').textContent(),rule.text);}
   eq('source PDF deep-link '+p.id,await page.locator('#detail-body .source-link').getAttribute('href'),provenance.files[0].url+'#page='+p.source.pdf_page);
   ok('complete SHA provenance '+p.id,(await text(page,'#detail-body')).includes(SOURCE));
   if(p===codeExample){await page.locator('#detail-add').click();eq('native detail-add adds the selected actual code row',await planRow(page,codeExample).count(),1);}
   if(p===midazolam){await page.locator('#detail-dialog').evaluate(e=>e.scrollTop=0);await screenshot(page,'midazolam-detail-beginning');await page.locator('#detail-dialog').evaluate(e=>e.scrollTop=e.scrollHeight);await screenshot(page,'midazolam-detail-bottom-source');}
   await closeDialog(page,'detail-dialog');
  }
  await openRecord(page,capsule);await page.getByRole('button',{name:'Originalseite in der App lesen',exact:true}).click();eq('detail-to-source correct page',await page.locator('#source-page').inputValue(),'34');await closeDialog(page,'source-dialog');await closeDialog(page,'detail-dialog');
  await page.locator('#source-button').click();
  for(const p of sourcePages.pages){await page.locator('#source-page').selectOption(String(p.page));eq('entire PDF page text '+p.page,await text(page,'#source-text'),p.text);eq('PDF page number '+p.page,await text(page,'#source-location'),`Originaltext (PDF-Textebene, kein OCR) · Seite ${p.page} von 34`);}
  await closeDialog(page,'source-dialog');
 }));

 await scenario('04-independent-known-material-money-boundaries',()=>isolated({},async page=>{
  await addRecord(page,material);
  for(const [q,cents] of MATERIAL_CASES){await quantityInput(page,material).fill(q);eq('material '+q+' independent known amount',await planRow(page,material).locator('.line-amount').textContent(),chf(cents));eq('material '+q+' subtotal',await text(page,'#total'),chf(cents===null?0:cents));eq('material '+q+' valid lexical draft',await quantityInput(page,material).getAttribute('aria-invalid'),'false');eq('material '+q+' persisted quantity',(await state(page)).lines[0].quantity,q);eq('material '+q+' explicit incomplete status',(await text(page,'#total-status')).startsWith('UNVOLLSTÄNDIG'),cents===null);}
  await quantityInput(page,material).fill('0.000001');eq('no automatic CHF5 prescription minimum or VAT',await text(page,'#total'),'CHF 0.10');
 }));

 await scenario('05-taxpoint-blocks-fixed-vessels-blood-and-open-subtotal',()=>isolated({},async page=>{
  const cases=[{p:service,q:'1',c:158},{p:service,q:'2',c:315},{p:codeExample,q:'1',c:1260},
   {p:serviceBlock,q:'1',c:2520},{p:serviceBlock,q:'2',c:5040},{p:serviceNextBlock,q:'1',c:1260},
   {p:capsule,q:'1',c:910},{p:capsule,q:'25',c:22750},{p:blood,q:'1',c:29945},{p:blood,q:'2',c:59890}];
  let previous=null;
  for(const {p,q,c} of cases){if(previous&&previous.id!==p.id)await planRow(page,previous).getByRole('button',{name:'Entfernen',exact:true}).click();if(!previous||previous.id!==p.id)await addRecord(page,p);await quantityInput(page,p).fill(q);eq(p.id+' blocks/quantity '+q+' independent cents',await planRow(page,p).locator('.line-amount').textContent(),chf(c));eq(p.id+' no automatic extra fees/VAT '+q,await text(page,'#total'),chf(c));previous=p;}
  await openRecord(page,blood);const b=await text(page,'#detail-body');ok('FAP reference not additional',b.includes('267.37')&&b.includes('Nicht erneut addieren')&&b.includes('Marge 12 %'));await closeDialog(page,'detail-dialog');
  await planRow(page,blood).getByRole('button',{name:'Entfernen',exact:true}).click();await addRecord(page,material);await addRecord(page,reference);await addRecord(page,unpriced);
  for(const p of [reference,unpriced]){eq(p.id+' open row remains visible',await planRow(page,p).locator('.line-amount').textContent(),'offen');ok(p.id+' explanatory open rule',(await planRow(page,p).locator('.error').textContent()).includes('Kein sicher modellierter Preis'));}
  eq('known subtotal excludes no invented zero',await text(page,'#total'),'CHF 0.10');ok('two unresolved explicitly incomplete',(await text(page,'#total-status')).includes('UNVOLLSTÄNDIG: 2'));
  const csv=parseCsv((await actualDownload(page,'#export-csv','open-rows')).text);for(const p of [reference,unpriced])eq(p.id+' CSV OFFEN',csv.find(r=>r[0]===p.id)[6],'OFFEN');
  await page.locator('#print').click();ok('print incomplete label',(await text(page,'#print-area')).includes('UNVOLLSTÄNDIGE Teilsumme: CHF 0.10'));
  const allOpen=positions.filter(p=>['reference_only','unpriced'].includes(p.price.kind));
  for(const p of allOpen){if(![reference.id,unpriced.id].includes(p.id))await addRecord(page,p);eq('every actual special/unpriced row remains open '+p.id,await planRow(page,p).locator('.line-amount').textContent(),'offen');}
  eq('all four special plus sixteen reference rows exercised',allOpen.length,20);eq('all unresolved known subtotal still ten Rappen',await text(page,'#total'),'CHF 0.10');ok('all twenty unresolved explicitly counted',(await text(page,'#total-status')).includes('UNVOLLSTÄNDIG: 20'));
 }));

 await scenario('06-native-invalid-quantity-drafts-export-and-print-refusal',()=>isolated({workspace:seeded([line(material),line(service),line(capsule)])},async page=>{
  for(const [p,invalids] of [[material,['-1','0','1e3','1000001','1.0000001']],[service,['-1','0','1.5','1e2','1000001']],[capsule,['-1','0','1.5','1e2','1000001']]]){
   for(const value of invalids){const before=await raw(page);await quantityInput(page,p).fill(value);
    eq(p.id+' invalid remains visible '+value,await quantityInput(page,p).inputValue(),value);eq(p.id+' aria-invalid '+value,await quantityInput(page,p).getAttribute('aria-invalid'),'true');eq(p.id+' open amount not stale valid money '+value,await planRow(page,p).locator('.line-amount').textContent(),'offen');eq('invalid quantity never persists '+value,await raw(page),before);ok('incomplete invalid subtotal '+value,(await text(page,'#total-status')).startsWith('UNVOLLSTÄNDIG'));ok('visible validation error '+value,(await planRow(page,p).locator('.error').textContent()).length>0);
    const downloads=page.__downloads.length,prints=await page.evaluate(()=>window.__nativeProbe.prints.length);
    for(const selector of ['#export-json','#export-csv','#print']){const rev=await page.evaluate(()=>window.__nativeProbe.statusRevision);await page.locator(selector).click();await page.waitForFunction(r=>window.__nativeProbe.statusRevision>r,rev);}
    eq('invalid export causes no native downloads '+value,page.__downloads.length,downloads);eq('invalid print boundary not invoked '+value,await page.evaluate(()=>window.__nativeProbe.prints.length),prints);eq('refusal still preserves raw '+value,await raw(page),before);
    await quantityInput(page,p).fill('1');eq('corrected draft valid '+value,await quantityInput(page,p).getAttribute('aria-invalid'),'false');
   }
  }
 }));

 await scenario('07-current-set-replaced-cleared-notes-real-exports-print-and-import',()=>isolated({workspace:seeded([line(material,'3.21'),line(capsule),line(midazolam,'0.001')],[material.id,capsule.id,midazolam.id])},async(page,context)=>{
  const phases=[{name:'  =NATIVE(1)',note:'\n @NATIVE-PLAN',lineNote:' \t+NATIVE-LINE'},
   {name:' -REPLACED',note:' \n=REPLACED\n<literal-only>',lineNote:'\t@REPLACED'},
   {name:'',note:'',lineNote:''}];let finalDownload;
  for(const [i,values] of phases.entries()){
   await setNotes(page,values);const json=await actualDownload(page,'#export-json','notes-'+i);eq('real JSON filename '+i,json.filename,'alt-sammlung.json');
   const parsed=JSON.parse(json.text);eq('JSON current name '+i,parsed.name,values.name);eq('JSON current plan note '+i,parsed.note,values.note);eq('JSON current line note '+i,parsed.lines.find(l=>l.id===material.id).note,values.lineNote);eq('JSON current quantity '+i,parsed.lines.find(l=>l.id===material.id).quantity,'3.21');eq('JSON current favorites '+i,parsed.favorites,[material.id,capsule.id,midazolam.id]);
   // Reapply immediately before each distinct output: no change/blur-only shortcut.
   await setNotes(page,values);const csvDownload=await actualDownload(page,'#export-csv','notes-'+i);const csv=parseCsv(csvDownload.text);
   eq('CSV BOM '+i,csvDownload.bytes.subarray(0,3).toString('hex'),'efbbbf');eq('CSV current name/formula protection '+i,csv[0][1],safeCsv(values.name));eq('CSV current plan note/formula protection '+i,csv[1][1],safeCsv(values.note));eq('CSV current line note/formula protection '+i,csv.find(r=>r[0]===material.id)[10],safeCsv(values.lineNote));eq('CSV known material money '+i,csv.find(r=>r[0]===material.id)[6],'0.35');eq('CSV known subtotal '+i,csv.find(r=>r[0]==='Teilsumme der ausgewählten Zeilen')[1],'CHF 9.55');
   await setNotes(page,values);const calls=await page.evaluate(()=>window.__nativeProbe.prints.length);await page.locator('#print').click();eq('instrumented window.print boundary once, NOT OS dialog '+i,await page.evaluate(()=>window.__nativeProbe.prints.length),calls+1);
   eq('print current title including cleared fallback '+i,await text(page,'#print-area > h1'),values.name||'ALT-Zusammenstellung');eq('print current plan note including cleared '+i,await page.locator('#print-area > pre').first().textContent(),values.note);
   const article=page.locator('#print-area article').filter({has:page.locator('h2',{hasText:material.title})});eq('print current line note including cleared '+i,await article.locator('pre').first().textContent(),values.lineNote);
   const printText=await text(page,'#print-area');ok('print real quantities money and source '+i,printText.includes('3.21 × '+material.unit)&&printText.includes('CHF 0.35')&&printText.includes('Teilsumme: CHF 9.55')&&printText.includes('PDF-Seite 8 · '+material.id)&&printText.includes(SOURCE));ok('print complete Midazolam note '+i,printText.includes(midazolam.notes));for(const id of ['general','I-intro','III-rules'])ok('print full original rule '+id+'/'+i,printText.includes(catalog.rules.find(r=>r.id===id).text));
   await page.emulateMedia({media:'print'});eq('light print root '+i,await page.locator('html').evaluate(e=>getComputedStyle(e).colorScheme),'light');eq('print paper background '+i,await page.locator('#print-area').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');eq('print black text '+i,await page.locator('#print-area').evaluate(e=>getComputedStyle(e).color),'rgb(0, 0, 0)');eq('print area actually displayed '+i,await page.locator('#print-area').evaluate(e=>getComputedStyle(e).display),'block');eq('screen UI excluded in print '+i,await page.locator('main').evaluate(e=>getComputedStyle(e).display),'none');if(i===1)await screenshot(page,'light-print-instrumented-not-os-dialog');await page.emulateMedia({media:'screen'});
   finalDownload=json;
  }
  // The payload is the actual earlier native download, not an invented serializer result.
  const expected=JSON.parse(finalDownload.text);await page.locator('#plan-name').fill('Different populated import target');await page.locator('#plan-note').fill('Do not lose before confirmation');await quantityInput(page,material).fill('9');await search(page,material.id);await page.locator(`[data-id="${material.id}"] .favorite`).click();
  const before=await raw(page),draft=await visibleDraft(page);
  for(const cancel of ['button','Escape']){await upload(page,finalDownload.bytes);await page.locator('#import-dialog').waitFor({state:'visible'});eq('preview nonmutating '+cancel,await raw(page),before);eq('preview populated draft nonmutating '+cancel,await visibleDraft(page),draft);ok('preview exact real file counts '+cancel,(await text(page,'#import-preview')).includes('3 Positionen · 3 gemerkt'));eq('before-image required '+cancel,await page.locator('#import-confirm').isDisabled(),true);if(cancel==='button')await closeDialog(page,'import-dialog');else{await page.keyboard.press('Escape');await page.locator('#import-dialog').waitFor({state:'hidden'});}eq('cancel unchanged exact raw '+cancel,await raw(page),before);}
  await upload(page,finalDownload.bytes);await page.locator('#import-dialog').waitFor({state:'visible'});const backup=await actualDownload(page,'#import-before','actual-before-image');eq('before-image exact current workspace',JSON.parse(backup.text),JSON.parse(before));eq('before-image name',backup.filename,'alt-vorher-sicherung.json');eq('confirm enabled only after real backup',await page.locator('#import-confirm').isEnabled(),true);
  await page.locator('#import-confirm').click();await page.locator('#import-dialog').waitFor({state:'hidden'});eq('confirmed import exact replacement',await state(page),expected);
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>document.body.dataset.ready==='true');eq('fresh document reload exact state',await state(page),expected);eq('reload exact name',await page.locator('#plan-name').inputValue(),expected.name);eq('reload exact note',await page.locator('#plan-note').inputValue(),expected.note);for(const l of expected.lines){eq('reload exact quantity '+l.id,await quantityInput(page,lookup.get(l.id)).inputValue(),l.quantity);eq('reload exact line note '+l.id,await planRow(page,lookup.get(l.id)).locator('textarea').inputValue(),l.note);}
  await expectMatches(page,{favoritesOnly:true},expected.favorites,'reload native favorites',true);
  const fresh=await newPage(context);eq('fresh own tab state same bytes',await raw(fresh),await raw(page));await assertSentinels(fresh,'fresh import tab');await fresh.close();
 }));

 await scenario('08-malformed-later-line-primitive-ids-duplicates-full-rejection',()=>isolated({workspace:seeded([line(material,'3.21','Keep first'),line(capsule,'2','Keep later')],[material.id,capsule.id])},async page=>{
  const good=await state(page);for(const [name,payload] of malformedFixtures(good))await rejectFile(page,Buffer.from(JSON.stringify(payload)),name);
  await rejectFile(page,Buffer.from('{ invalid JSON'),'syntax');await rejectFile(page,Buffer.alloc(5*1024*1024+1,32),'over-5MiB');
 }));

 for(const [name,options] of [
  ['09-corrupt-readable-raw-backup',{rawValue:' \n{broken source: DO NOT OVERWRITE}\t '}],
  ['10-blocked-native-read',{workspace:seeded(),readBlocked:true}],
  ['11-blocked-native-write',{workspace:seeded(),writeFault:'SecurityError'}],
  ['12-native-quota',{workspace:seeded(),writeFault:'QuotaExceededError'}]
 ])await scenario(name,()=>isolated(options,async page=>{
  const original=await raw(page);if(options.writeFault){await page.locator('#plan-name').fill('Memory after '+options.writeFault);}await assertLocked(page,name);
  await addRecord(page,capsule);await page.locator('#plan-note').fill('Memory remains usable, no persistent success');eq('fault preserves original exact raw',await raw(page),original);await assertLocked(page,name+' after edits');
  eq('memory retains added row',await planRow(page,capsule).count(),1);const exported=JSON.parse((await actualDownload(page,'#export-json',name+'-memory')).text);ok('valid in-memory export despite storage refusal',exported.lines.some(l=>l.id===capsule.id));eq('in-memory newest note',exported.note,'Memory remains usable, no persistent success');
  if(options.readBlocked)eq('unreadable raw backup honestly disabled',await page.locator('#raw-backup').isDisabled(),true);else{const backup=await actualDownload(page,'#raw-backup',name+'-raw');eq('actual raw backup bytes',backup.bytes,Buffer.from(original));}
  const faults=await page.evaluate(()=>window.__nativeProbe.faults);if(options.readBlocked||options.writeFault){ok('exact intentional storage fault actually exercised',faults.length>0);ok('fault key classification exact',faults.every(f=>f.key===KEY&&f.name===(options.writeFault||'SecurityError')));logEvent({type:'intentional-storage-faults',faults});}
 }));

 await scenario('13-real-two-tab-conflict-preserves-unfinished-notes-and-foreign-raw',()=>isolated({workspace:seeded([line(material,'3.21','Initial line')])},async(page,context)=>{
  await page.locator('#plan-name').fill('Local unfinished name');await page.locator('#plan-note').fill('Local unfinished plan note');await planRow(page,material).locator('textarea').fill('Local unfinished line note');
  const foreign=await newPage(context);await foreign.locator('#plan-name').fill('Foreign tab durable name');const foreignRaw=await raw(foreign);await page.locator('#storage-warning').waitFor({state:'visible'});await assertLocked(page,'real storage event');
  await page.locator('#plan-note').fill('Local unfinished plan note retained after event');await planRow(page,material).locator('textarea').fill('Local unfinished line retained after event');eq('real event local name preserved',await page.locator('#plan-name').inputValue(),'Local unfinished name');eq('real event foreign bytes untouched',await raw(page),foreignRaw);
  const exported=JSON.parse((await actualDownload(page,'#export-json','two-tab-current-draft')).text);eq('real event current name exported',exported.name,'Local unfinished name');eq('real event current plan note exported',exported.note,'Local unfinished plan note retained after event');eq('real event current line note exported',exported.lines[0].note,'Local unfinished line retained after event');eq('export did not overwrite other tab',await raw(foreign),foreignRaw);await assertSentinels(foreign,'foreign writer tab');await foreign.close();
 }));

 await scenario('14-silent-raw-drift-guard-preserves-draft-and-foreign-bytes',()=>isolated({workspace:seeded([line(material,'3.21','Initial line')])},async page=>{
  await page.locator('#plan-name').fill('Unfinished silent-drift name');await planRow(page,material).locator('textarea').fill('Unfinished line before drift');
  const foreign={...seeded([line(capsule,'2')]),name:'Silent foreign replacement'};const foreignRaw=JSON.stringify(foreign)+'\n';await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:KEY,value:foreignRaw});
  eq('same-document raw change not synthetic storage event',await page.locator('#storage-warning').isVisible(),false);await page.locator('#plan-note').fill('New unfinished plan note after silent drift');await assertLocked(page,'silent compare-before-write');eq('silent foreign exact bytes survive',await raw(page),foreignRaw);eq('silent drift input name retained',await page.locator('#plan-name').inputValue(),'Unfinished silent-drift name');eq('silent drift line input retained',await planRow(page,material).locator('textarea').inputValue(),'Unfinished line before drift');
  const exported=JSON.parse((await actualDownload(page,'#export-json','silent-current-draft')).text);eq('silent current plan note exported',exported.note,'New unfinished plan note after silent drift');eq('silent current line note exported',exported.lines[0].note,'Unfinished line before drift');eq('silent export does not clobber',await raw(page),foreignRaw);
 }));

 await scenario('15-navigation-keyboard-configured-links-only',()=>isolated({width:1440},async page=>{
  const repos=['arzneimittelliste','spezialitaetenliste','analysenliste','dentotar','migel','pflegefinanzierung','arzttarife','physiotherapie','spitaltarife'];
  const links=await page.locator('.catalog-switch a,.catalog-directory nav a').evaluateAll(as=>as.map(a=>({href:a.href,current:a.getAttribute('aria-current'),target:a.getAttribute('target'),onclick:a.onclick===null})));
  eq('three direct configured destinations',await page.locator('.catalog-switch > a').count(),3);eq('six directory configured destinations',await page.locator('.catalog-directory nav a').count(),6);eq('nine exact canonical unique destinations',links.map(a=>a.href),repos.map(r=>'https://wakuwakumiwaku.github.io/'+r+'/'));eq('exactly one globally current',links.filter(a=>a.current!==null).map(a=>[a.href,a.current]),[['https://wakuwakumiwaku.github.io/arzneimittelliste/','page']]);ok('normal same-window anchors no JS handlers',links.every(a=>a.target===null&&a.onclick));
  eq('navigation not sticky',await page.locator('.catalog-switch').evaluate(e=>getComputedStyle(e).position),'static');const summary=page.locator('.catalog-directory > summary');await summary.focus();await page.keyboard.press('Enter');eq('keyboard native menu opens',await page.locator('.catalog-directory').getAttribute('open'),'');await page.keyboard.press('Tab');eq('keyboard reaches first hidden-directory anchor',await page.evaluate(()=>document.activeElement?.getAttribute('href')),'https://wakuwakumiwaku.github.io/dentotar/');await summary.focus();await page.keyboard.press('Enter');eq('keyboard native menu closes',await page.locator('.catalog-directory').getAttribute('open'),null);
  eq('all navigation actions stayed on own local app',new URL(page.url()).origin,origin);
 }));
 // Each viewport owns a fresh context and an independent failure record, so an
 // earlier desktop defect cannot prevent the 320px case from being exercised.
 for(const [i,width] of [1440,768,390,320].entries())await scenario(`${16+i}-responsive-${width}`,()=>isolated({workspace:seeded([line(material,'3.21'),line(midazolam,'0.001')]),width},async page=>{
   await reset(page);await page.locator('#results').scrollIntoViewIfNeeded();await screenshot(page,'width-'+width+'-actual-rows');await geometry(page,'width-'+width+' actual results');
   await page.locator('#total').scrollIntoViewIfNeeded();await screenshot(page,'width-'+width+'-actual-total');await geometry(page,'width-'+width+' actual total');
   await openRecord(page,midazolam);await page.locator('#detail-dialog').evaluate(e=>e.scrollTop=0);await screenshot(page,'width-'+width+'-detail-beginning');await geometry(page,'width-'+width+' detail beginning');
   for(const detail of await page.locator('#detail-body details').all())await detail.locator('summary').click();
   await page.locator('#detail-dialog').evaluate(e=>e.scrollTop=e.scrollHeight);ok('bottom source provenance is in actual detail DOM',(await text(page,'#detail-body')).includes(SOURCE));await screenshot(page,'width-'+width+'-detail-bottom-source');await geometry(page,'width-'+width+' detail bottom source');await closeDialog(page,'detail-dialog');
   await page.locator('#source-button').click();await page.locator('#source-page').selectOption('34');await page.locator('#source-text').scrollIntoViewIfNeeded();eq('page34 full rendered source unchanged '+width,await text(page,'#source-text'),sourcePages.pages[33].text);await screenshot(page,'width-'+width+'-source34-content');await geometry(page,'width-'+width+' full original source');await page.locator('#source-dialog').evaluate(e=>e.scrollTop=e.scrollHeight);await screenshot(page,'width-'+width+'-source34-bottom');await closeDialog(page,'source-dialog');
   await page.locator('#source-button').click();await page.locator('#source-page').selectOption('1');eq('page1 full rendered source '+width,await text(page,'#source-text'),sourcePages.pages[0].text);await closeDialog(page,'source-dialog');
   eq('responsive actions stayed on own local app '+width,new URL(page.url()).origin,origin);
 }));
 await scenario('20-browser-beforeprint-current-state-and-invalid-draft-safety',()=>isolated({workspace:{...seeded([line(material,'3.21','SYNTHETIC-REMOVED-LINE-NOTE'),line(capsule,'2','SYNTHETIC-REMOVED-ROW')]),note:'SYNTHETIC-REMOVED-PLAN-NOTE'}},async page=>{
  await page.locator('#print').click();
  ok('valid button-print control contains initial plan note',(await text(page,'#print-area')).includes('SYNTHETIC-REMOVED-PLAN-NOTE'));
  await page.locator('#plan-name').fill('Aktuelle Browserdruck-Sammlung');await page.locator('#plan-note').fill('');await planRow(page,material).locator('textarea').fill('');await quantityInput(page,material).fill('9');await planRow(page,capsule).getByRole('button',{name:'Entfernen',exact:true}).click();
  const before=await raw(page),calls=await page.evaluate(()=>window.__nativeProbe.prints.length);
  eq('cleared notes really persisted before browser print',(await state(page)).note,'');eq('cleared line note really persisted before browser print',(await state(page)).lines[0].note,'');
  // Exercise the app's registered browser-print event handler, not a copied
  // renderer. This dispatched native boundary is NOT an OS print dialog.
  const beforeprint=()=>page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  await beforeprint();const printed=await text(page,'#print-area');
  logEvent({type:'beforeprint-regression',boundary:'dispatched beforeprint, not OS dialog',containsDeletedPlanNote:printed.includes('SYNTHETIC-REMOVED-PLAN-NOTE'),containsDeletedLineNote:printed.includes('SYNTHETIC-REMOVED-LINE-NOTE'),containsRemovedRow:printed.includes(capsule.id)});
  ok('browser beforeprint never resurrects deleted plan note',!printed.includes('SYNTHETIC-REMOVED-PLAN-NOTE'));ok('browser beforeprint never resurrects deleted line note',!printed.includes('SYNTHETIC-REMOVED-LINE-NOTE'));ok('browser beforeprint excludes removed row',!printed.includes(capsule.id));
  eq('browser print current collection name',await text(page,'#print-area > h1'),'Aktuelle Browserdruck-Sammlung');eq('browser print current cleared plan note',await page.locator('#print-area > pre').first().textContent(),'');eq('browser print only current row',await page.locator('#print-area article').count(),1);eq('browser print current cleared line note',await page.locator('#print-area article pre').first().textContent(),'');ok('browser print current quantity and subtotal',printed.includes('9 × '+material.unit)&&printed.includes('Teilsumme: CHF 0.40'));
  eq('beforeprint does not recursively invoke print',await page.evaluate(()=>window.__nativeProbe.prints.length),calls);eq('beforeprint never writes persisted state',await raw(page),before);
  await page.reload({waitUntil:'load'});await page.waitForFunction(()=>document.body.dataset.ready==='true');await beforeprint();eq('browser print works before any print-button click after reload',await text(page,'#print-area > h1'),'Aktuelle Browserdruck-Sammlung');ok('reload browser print current known subtotal',(await text(page,'#print-area')).includes('Teilsumme: CHF 0.40'));eq('reload print preserves exact persisted bytes',await raw(page),before);
  await quantityInput(page,material).fill('0');await beforeprint();
  eq('invalid browser-print draft replaces stale output with explicit warning',await text(page,'#print-area > h1'),'Keine gültige Druckansicht');eq('invalid browser-print draft has no cached priced articles',await page.locator('#print-area article').count(),0);ok('invalid browser-print diagnostic explains invalid quantity',(await text(page,'#print-area')).includes('grösser als 0'));ok('invalid browser-print diagnostic never shows stale subtotal',!(await text(page,'#print-area')).includes('CHF 0.40'));eq('invalid browser-print leaves storage untouched',await raw(page),before);
  await page.emulateMedia({media:'print'});eq('browser-print diagnostic actually displayed in print CSS',await page.locator('#print-area').evaluate(e=>getComputedStyle(e).display),'block');await screenshot(page,'browser-beforeprint-invalid-draft-diagnostic');await page.emulateMedia({media:'screen'});
  await page.locator('#print').click();eq('invalid print button still refuses native print',await page.evaluate(()=>window.__nativeProbe.prints.length),0);
  await quantityInput(page,material).fill('1');await beforeprint();ok('corrected browser-print draft recovers current amount',(await text(page,'#print-area')).includes('Teilsumme: CHF 0.10'));
  const imported={...seeded([line(capsule,'2','SYNTHETIC-IMPORTED-LINE')],[capsule.id]),name:'SYNTHETIC-IMPORTED-PRINT',note:'SYNTHETIC-IMPORTED-PLAN'};
  await upload(page,Buffer.from(JSON.stringify(imported)),'beforeprint-import.json');await page.locator('#import-dialog').waitFor({state:'visible'});await actualDownload(page,'#import-before','beforeprint-before-image');await page.locator('#import-confirm').click();await page.locator('#import-dialog').waitFor({state:'hidden'});eq('real parsed confirmed import persisted',await state(page),imported);
  await beforeprint();eq('browser print follows real confirmed import',await text(page,'#print-area > h1'),imported.name);ok('browser print current imported note and money',(await text(page,'#print-area')).includes(imported.note)&&(await text(page,'#print-area')).includes('Teilsumme: CHF 18.20'));ok('browser print excludes replaced collection row',!(await text(page,'#print-area')).includes(material.id));
  page.once('dialog',dialog=>dialog.accept());await page.locator('#clear').click();await beforeprint();eq('browser print follows actual collection clear',await page.locator('#print-area article').count(),0);ok('clear cannot resurrect imported note',!(await text(page,'#print-area')).includes(imported.note));eq('cleared collection really persisted',(await state(page)).lines,[]);
 }));
 currentScenario='final-observability';eq('all 20 named native scenarios actually executed',report.scenarios.length,20);eq('no duplicate native scenario names',new Set(report.scenarios.map(s=>s.name)).size,20);eq('all page console warnings/errors/pageerrors, HTTP/request failures, methods and external requests clean',report.violations,[]);
}catch(error){report.scenarios.push({name:currentScenario,status:'failed',error:error.stack});console.error(error.stack);}
finally{
 currentScenario='cleanup';
 for(const context of contexts){try{await context.close();}catch(error){report.violations.push({type:'context-cleanup',message:error.message});}}contexts.clear();
 if(browser)try{await browser.close();}catch(error){report.violations.push({type:'browser-cleanup',message:error.message});}
 if(server)try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){report.violations.push({type:'server-cleanup',message:error.message});}
 report.finishedAt=new Date().toISOString();report.status=report.scenarios.some(s=>s.status==='failed')||report.assertions.some(a=>a.status==='failed')||report.violations.length?'failed':'passed';
 report.totals={scenarios:report.scenarios.length,passedScenarios:report.scenarios.filter(s=>s.status==='passed').length,failedScenarios:report.scenarios.filter(s=>s.status==='failed').length,assertions:report.assertions.length,failedAssertions:report.assertions.filter(a=>a.status==='failed').length,violations:report.violations.length,downloads:report.downloads.length,screenshots:report.screenshots.length};
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(artifacts,'timings.json'),JSON.stringify({metric:'input event capture to next animation frame; actual rendered count; no before/after claim',measurements:report.timings},null,2)+'\n');
 console.log(JSON.stringify({status:report.status,...report.totals,artifacts:path.relative(ROOT,artifacts),printBoundary:report.printBoundary}));
 for(const stream of ['stdout','stderr']){appendFileSync(path.join(artifacts,stream+'.log'),'');process[stream].write=originals[stream];}
 process.exitCode=report.status==='passed'?0:1;
}
