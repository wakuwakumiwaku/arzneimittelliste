// Actual app ESM; synthetic DOM, File.text and localStorage boundaries only.
// Not native browser evidence. VM ExperimentalWarning belongs to this adapter.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const [root,scenario]=process.argv.slice(2);
const source=await readFile(root+'/src/app.js','utf8');
const domain=await import(pathToFileURL(root+'/src/domain.js'));
const catalog=JSON.parse(await readFile(root+'/public/data/catalog.json','utf8'));
class Element{
 constructor(){Object.assign(this,{value:'',textContent:'',children:[],dataset:{},listeners:{},disabled:false,hidden:false,open:false,checked:false});}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}setAttribute(k,v){this[k]=v;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}fire(k){for(const fn of this.listeners[k]||[])fn();}
 showModal(){this.open=true;}close(){this.open=false;this.fire('close');}click(){this.fire('click');}remove(){}
}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
const foreign=Object.fromEntries(['dentotar','migel','sl','analysenliste','pflegefinanzierung','arzttarife','physiotherapie','spitaltarife'].map(n=>[n+'.workspace.v1',' synthetic foreign '+n+'\n']));
const initial={...domain.emptyWorkspace(catalog),name:'Synthetic retained draft',note:'Original note',lines:[{id:catalog.positions[0].id,quantity:'2',note:'Original line'}]};
const initialRaw=' \n'+JSON.stringify(initial)+'  ';
const raw=new Map([...Object.entries(foreign),[domain.STORAGE_KEY,initialRaw]]),writes=[],downloads=[];
const local={getItem:k=>raw.get(k)??null,setItem(k,v){writes.push({key:k,value:v});raw.set(k,v);}};
const document={getElementById:get,createElement:()=>new Element(),createDocumentFragment:()=>new Element(),querySelectorAll:()=>[],body:new Element()};
class DownloadURL extends URL{static createObjectURL(blob){downloads.push(blob);return 'blob:synthetic';}static revokeObjectURL(){}}
const context=vm.createContext({document,window:{localStorage:local,addEventListener(){}},URL:DownloadURL,Blob,structuredClone,console,setTimeout:()=>0});
context.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile(root+'/public/data/'+new URL(url).pathname.split('/').at(-1),'utf8'))});
const app=new vm.SourceTextModule(source,{context,initializeImportMeta(meta){meta.url=pathToFileURL(root+'/src/app.js').href;}});
const module=new vm.SyntheticModule(Object.keys(domain),function(){for(const [k,v]of Object.entries(domain))this.setExport(k,v);},{context});
await app.link(spec=>{assert.equal(spec,'./domain.js');return module;});await app.evaluate();
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
for(let i=0;i<400&&document.body.dataset.ready===undefined;i++)await new Promise(r=>setTimeout(r,5));
assert.equal(document.body.dataset.ready,'true','actual app initialized: '+get('status').textContent);
const B={...domain.emptyWorkspace(catalog),name:'Synthetic current import B',note:'B note',favorites:[catalog.positions[1].id]};
const select=async file=>{get('import-file').files=[file];get('import-file').fire('change');await settle();};
const file=w=>({size:100,text:async()=>JSON.stringify(w)});
let resolve,reject;const pending=new Promise((a,b)=>{resolve=a;reject=b;});
const held={size:100,text:()=>pending};
const confirm=async()=>{get('import-before').click();await settle();assert.equal(downloads.length,1,'actual before-image download');assert.deepEqual(JSON.parse(await downloads[0].text()),initial);assert.equal(get('import-confirm').disabled,false);get('import-confirm').click();await settle();assert.deepEqual(JSON.parse(raw.get(domain.STORAGE_KEY)),B);assert.equal(writes.length,1);assert.equal(get('import-dialog').open,false);};
if(scenario==='current-read-error'){
 await select({size:100,text:async()=>{throw Error('current read failed');}});assert.match(get('status').textContent,/current read failed/);
}else if(scenario==='current-invalid-json'){
 await select({size:100,text:async()=>'{broken'});assert.ok(get('status').textContent!==''&&get('status').textContent!==catalog.positions.length+' amtliche Quellzeilen geladen · alle Bereiche · Ausgabe 1. Juli 2026');assert.equal(get('import-dialog').open,false);
}else{
 await select(held);await select(file(B));assert.equal(get('import-dialog').open,true);assert.ok(get('import-preview').textContent.includes(B.name));
 if(scenario==='old-error-after-confirm')await confirm();
 const beforeStatus=get('status').textContent;
 if(scenario==='old-success-new-preview')resolve(JSON.stringify(initial));else reject(Error('obsolete A read failed'));
 await settle();assert.equal(get('status').textContent,beforeStatus,'obsolete file read must not replace the current operation status');
 if(scenario!=='old-error-after-confirm')await confirm();
}
if(scenario.startsWith('current-')){assert.equal(writes.length,0);assert.equal(raw.get(domain.STORAGE_KEY),initialRaw);assert.equal(get('plan-name').value,initial.name);assert.equal(get('plan-note').value,initial.note);}
for(const [k,v]of Object.entries(foreign))assert.equal(raw.get(k),v);assert.ok(writes.every(w=>w.key===domain.STORAGE_KEY));
console.log(JSON.stringify({scenario,passed:true,writes:writes.length,foreignKeysPreserved:8,nativeBrowserExecuted:false}));
