import {PRICE_LABELS,StorageGuard,STORAGE_KEY,validateCatalog,validateWorkspace,emptyWorkspace,searchIndex,filterPositions,lineAmount,totals,money,workspaceCsv,quantity} from './domain.js';
const $=id=>document.getElementById(id),PAGE_SIZE=40;
let catalog,pages,provenance,byId,index,guard,workspace,visible=PAGE_SIZE,selected=null,importCandidate=null,importSnapshot='',importToken=0;
const drafts=new Map();
function node(tag,text='',className=''){const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
function button(text,fn,className=''){const e=node('button',text,className);e.type='button';e.addEventListener('click',()=>attempt(fn));return e;}
function report(message){$('status').textContent=message;}
function attempt(fn){const failed=e=>{report(e.message);if(guard?.locked)storageNotice();};try{const p=fn();if(p&&typeof p.catch==='function')p.catch(failed);}catch(e){failed(e);}}
function storageNotice(){$('raw-backup').disabled=!guard.readable;if(guard.locked){$('storage-warning').hidden=false;$('storage-message').textContent=guard.reason;$('save-state').textContent='Nur lokaler Entwurf; automatisches Speichern pausiert. JSON-Sicherung bleibt möglich.';if($('import-dialog').open)$('import-confirm').disabled=true;}else{$('save-state').textContent='Änderungen automatisch lokal gespeichert. Speicherbereich: '+STORAGE_KEY;}}
function persist(){try{guard.save(workspace);}catch(e){report(e.message);}storageNotice();}
function labelPrice(p){const a=p.price;if(a.kind==='taxpoints')return a.points+' TP · CHF 1.05/TP';if(a.kind==='fixed_chf')return 'CHF '+a.chf+' / Gebinde';if(a.kind==='graduated_chf'){const c=a.cells[0];return 'Ab Ansatz '+c.quantity+' → CHF '+c.chf;}return 'Preis offen';}
function currentLines(){return workspace.lines.map(l=>drafts.has(l.id)?{...l,quantity:drafts.get(l.id)}:l);}
function assertDrafts(){for(const l of currentLines())quantity(l.quantity,['fixed_chf','taxpoints'].includes(byId.get(l.id).price.kind));}
function renderTotal(){const t=totals(currentLines(),byId);$('total').textContent=money(t.cents);$('total-status').textContent=t.complete?'Summe der ausgewählten Zeilen, kein vollständiger Rezeptur-/Abrechnungsbetrag.':`UNVOLLSTÄNDIG: ${t.unresolved} offene oder ungültige Zeile(n) nicht als CHF 0 bewertet.`;return t;}
function renderResults(){
 const matches=filterPositions(catalog,index,{query:$('search').value,section:$('section').value,kind:$('kind').value,flag:$('flag').value,favoritesOnly:$('favorites-only').checked,favorites:workspace.favorites});
 const shown=matches.slice(0,visible),fragment=document.createDocumentFragment();
 for(const p of shown){
  const row=node('article','','result-row');row.dataset.id=p.id;
  const starred=workspace.favorites.includes(p.id),star=button(starred?'★':'☆',()=>{workspace.favorites=starred?workspace.favorites.filter(id=>id!==p.id):[...workspace.favorites,p.id];persist();renderResults();},'favorite');star.setAttribute('aria-label',(starred?'Aus Merkliste entfernen: ':'Merken: ')+p.title);star.setAttribute('aria-pressed',String(starred));
  const main=button('',()=>showDetail(p),'row-main');main.append(node('span',p.title,'row-title'),node('span',[p.code,...p.flags,'PDF S. '+p.source.pdf_page].filter(Boolean).join(' · '),'row-meta'),node('span',labelPrice(p),'price'),node('span',p.unit,'row-meta'));
  const add=button('+',()=>addLine(p),'add');add.setAttribute('aria-label','Hinzufügen: '+p.title);row.append(star,main,add);fragment.append(row);
 }
 if(!shown.length)fragment.append(node('p','Keine Positionen für diese Filter. Suche/Filter zurücksetzen oder Originalquelle prüfen.','empty'));
 $('results').replaceChildren(fragment);$('result-count').textContent=`${matches.length} Treffer im vollständigen Katalog (${catalog.positions.length} Quellzeilen) · ${shown.length} angezeigt`;$('more').hidden=shown.length===matches.length;
}
function addLine(p){if(workspace.lines.some(l=>l.id===p.id)){report('Bereits in der Sammlung. Menge dort anpassen.');return;}if(workspace.lines.length>=1000)throw Error('Maximal 1 000 Zeilen.');workspace.lines.push({id:p.id,quantity:'1',note:''});persist();renderPlan();report('Hinzugefügt: '+p.title);}
function renderPlan(){
 $('plan-name').value=workspace.name;$('plan-note').value=workspace.note;const fragment=document.createDocumentFragment();
 for(const l of workspace.lines){
  const p=byId.get(l.id),row=node('article','','plan-line');row.dataset.planId=p.id;
  row.append(button(p.title,()=>showDetail(p),'line-title'),node('p',p.unit+' · PDF S. '+p.source.pdf_page,'meta'));
  const controls=node('div','','line-controls'),lab=node('label','Menge / Anzahl Leistungsblöcke'),input=document.createElement('input');input.type='text';input.inputMode='decimal';input.value=drafts.get(p.id)??l.quantity;input.setAttribute('aria-label','Menge: '+p.title);input.maxLength=30;lab.append(input);
  const amount=node('strong','','line-amount'),error=node('p','','error');error.setAttribute('aria-live','polite');
  const update=()=>{try{const a=lineAmount(p,input.value);amount.textContent=money(a.cents);amount.title=a.rule;error.textContent=a.cents===null?a.rule:'';input.setAttribute('aria-invalid','false');return true;}catch(e){amount.textContent='offen';error.textContent=e.message;input.setAttribute('aria-invalid','true');return false;}};
  input.addEventListener('input',()=>{drafts.set(p.id,input.value);if(update()){l.quantity=input.value;drafts.delete(p.id);persist();}renderTotal();});
  const remove=button('Entfernen',()=>{workspace.lines=workspace.lines.filter(x=>x.id!==l.id);drafts.delete(l.id);persist();renderPlan();});controls.append(lab,remove);row.append(controls,amount,error);
  const noteLabel=node('label','Zeilennotiz'),note=document.createElement('textarea');note.rows=2;note.maxLength=2000;note.value=l.note;note.setAttribute('aria-label','Notiz: '+p.title);note.addEventListener('input',()=>{l.note=note.value;persist();});noteLabel.append(note);row.append(noteLabel);update();fragment.append(row);
 }
 if(!workspace.lines.length)fragment.append(node('p','Noch keine Positionen. Mit + im Katalog hinzufügen.','empty'));
 $('plan-lines').replaceChildren(fragment);renderTotal();storageNotice();
}
function sourceAnchor(text,page){const a=node('a',text,'source-link');a.href=provenance.files[0].url+'#page='+page;a.rel='noreferrer';return a;}
function originalDetails(title,text){const d=node('details'),s=node('summary',title);d.append(s,node('pre',text,'original'));return d;}
function showDetail(p){
 selected=p;const body=$('detail-body');$('detail-title').textContent=p.title;
 const section=catalog.sections.find(s=>s.id===p.section);body.replaceChildren(node('p',section.title+' · '+(p.code?'Quellcode '+p.code+' · ':'')+'PDF-Seite '+p.source.pdf_page,'detail-meta'),node('p','Interne Quellzeilen-ID: '+p.id,'meta'),node('p','Hierarchie: '+p.hierarchy.join(' → '),'meta'),node('p',PRICE_LABELS[p.price.kind]+' · '+p.unit));
 if(p.flags.length)body.append(node('p','Originalmarkierung: '+p.flags.join(' · '),'warning'));
 const a=p.price;
 if(a.cells?.length){const grid=node('div','','price-list');for(const c of a.cells){const cell=node('div',c.quantity+' '+p.unit,'price-cell');cell.append(node('strong','CHF '+c.chf));grid.append(cell);}body.append(grid);}
 if(a.kind==='fixed_chf')body.append(node('p','Abrechnungspreis: CHF '+a.chf+' pro '+p.unit,'price'));
 if(a.manufacturer_chf)body.append(node('p','Fabrikabgabepreis CHF '+a.manufacturer_chf+' nur Referenz. Im Abrechnungspreis bereits enthalten: Marge 12 % inkl. Transport. Nicht erneut addieren.','warning'));
 if(a.kind==='taxpoints')body.append(node('p',a.points+' Taxpunkte × CHF '+a.chf_per_point+' pro Punkt, exkl. MWST.','price'));
 if(p.notes){body.append(node('h3','Vollständiger Zeilenhinweis'),node('pre',p.notes,'original'));}
 const example=lineAmount(p,'1');body.append(node('p',example.rule,'meta'),sourceAnchor('Amtliches PDF · Seite '+p.source.pdf_page,p.source.pdf_page),button('Originalseite in der App lesen',()=>showSources(p.source.pdf_page)));
 for(const id of p.rule_ids){const r=catalog.rules.find(r=>r.id===id);body.append(originalDetails(r.title,r.text));}
 body.append(node('p',`Quellposition auf Seite ${p.source.pdf_page}, PDF-y ${p.source.y_min}–${p.source.y_max}. Ausgabe ${catalog.edition}. Original-SHA256: ${catalog.source_sha256}`,'meta'));
 if(!$('detail-dialog').open)$('detail-dialog').showModal();
}
function showSources(page=3){$('source-page').value=String(page);renderSourcePage();if(!$('source-dialog').open)$('source-dialog').showModal();}
function renderSourcePage(){const p=pages.pages.find(p=>p.page===Number($('source-page').value));$('source-location').textContent='Originaltext (PDF-Textebene, kein OCR) · Seite '+p.page+' von 34';$('source-text').textContent=p.text;}
function download(name,text,type='application/json'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function exportJson(prefix='alt-sammlung'){assertDrafts();const checked=validateWorkspace(workspace,catalog);download(prefix+'.json',JSON.stringify(checked,null,2)+'\n');report('JSON-Sicherung heruntergeladen. Persönliche Sammlung bleibt lokal.');}
function renderPrintPlan(){
 const area=$('print-area');area.replaceChildren();assertDrafts();const t=renderTotal();area.append(node('h1',workspace.name||'ALT-Zusammenstellung'),node('p','Ausgabe '+catalog.edition+' · ALT, BAG · Teilsumme exkl. MWST'),node('pre',workspace.note,'original'));
 const ruleIds=new Set();for(const r of t.results){const article=node('article');article.append(node('h2',r.position.title),node('p',`${r.line.quantity} × ${r.position.unit} · ${PRICE_LABELS[r.position.price.kind]} · ${money(r.cents)}`),node('p',r.rule),node('pre',r.line.note,'original'),node('pre',r.position.notes,'original'),node('p',`PDF-Seite ${r.position.source.pdf_page} · ${r.position.id}`));area.append(article);for(const id of r.position.rule_ids)ruleIds.add(id);}
 area.append(node('h2',(t.complete?'Teilsumme: ':'UNVOLLSTÄNDIGE Teilsumme: ')+money(t.cents)),node('p',`${t.unresolved} offene Zeile(n). Keine MWST, kein Rezepturminimum und keine automatischen Zuschläge. Keine Abrechnungs-/Erstattungszusage.`));for(const id of ruleIds){const r=catalog.rules.find(r=>r.id===id);area.append(node('h3',r.title),node('pre',r.text,'original'));}area.append(node('p','Original: '+provenance.files[0].url),node('p','Original-SHA256: '+catalog.source_sha256));area.hidden=false;
}
function printPlan(){renderPrintPlan();window.print();}
function beforePrint(){try{renderPrintPlan();}catch(e){const area=$('print-area');area.replaceChildren(node('h1','Keine gültige Druckansicht'),node('p',e.message));area.hidden=false;report(e.message);}}
async function previewFile(file){
 const token=++importToken;importCandidate=null;$('import-confirm').disabled=true;
 if(!file)return;if(file.size>5*1024*1024)throw Error('Sicherung ist zu gross (maximal 5 MiB).');
 let data;try{data=await file.text();}catch(e){if(token!==importToken)return;throw e;}if(token!==importToken)return;
 const candidate=validateWorkspace(JSON.parse(data),catalog);assertDrafts();importSnapshot=JSON.stringify(workspace);importCandidate=candidate;
 $('import-preview').textContent=`„${candidate.name}“ · ${candidate.lines.length} Positionen · ${candidate.favorites.length} gemerkt · Ausgabe ${candidate.edition}. Aktuell: ${workspace.lines.length} Positionen. Noch nichts ersetzt.`;
 $('import-before').disabled=false;$('import-confirm').disabled=true;$('import-dialog').showModal();
}
function initialize(){
 window.addEventListener('beforeprint',beforePrint);
 for(const d of document.querySelectorAll('[data-close]'))d.addEventListener('click',()=>$(d.dataset.close).close());
 $('detail-add').addEventListener('click',()=>attempt(()=>addLine(selected)));
 $('source-button').addEventListener('click',()=>showSources());$('source-page').addEventListener('change',renderSourcePage);
 for(const id of ['search','section','kind','flag','favorites-only'])$(id).addEventListener(id==='search'?'input':'change',()=>{visible=PAGE_SIZE;renderResults();});
 $('reset').addEventListener('click',()=>{$('search').value='';$('section').value='';$('kind').value='';$('flag').value='';$('favorites-only').checked=false;visible=PAGE_SIZE;renderResults();});
 $('more').addEventListener('click',()=>{visible+=PAGE_SIZE;renderResults();});
 $('plan-name').addEventListener('input',()=>{workspace.name=$('plan-name').value;persist();});$('plan-note').addEventListener('input',()=>{workspace.note=$('plan-note').value;persist();});
 $('export-json').addEventListener('click',()=>attempt(()=>exportJson()));$('export-csv').addEventListener('click',()=>attempt(()=>{assertDrafts();download('alt-zusammenstellung.csv',workspaceCsv(workspace,catalog),'text/csv;charset=utf-8');}));$('print').addEventListener('click',()=>attempt(printPlan));
 $('import-json').addEventListener('click',()=>{$('import-file').value='';$('import-file').click();});$('import-file').addEventListener('change',()=>attempt(()=>previewFile($('import-file').files[0])));
 $('import-before').addEventListener('click',()=>attempt(()=>{if(!importCandidate||JSON.stringify(workspace)!==importSnapshot)throw Error('Vorschau veraltet; Sicherung nochmals öffnen.');exportJson('alt-vorher-sicherung');$('import-before').disabled=true;$('import-confirm').disabled=guard.locked;}));
 $('import-confirm').addEventListener('click',()=>attempt(()=>{if(!importCandidate||$('import-confirm').disabled||JSON.stringify(workspace)!==importSnapshot)throw Error('Keine aktuelle bestätigbare Vorschau.');const candidate=validateWorkspace(importCandidate,catalog);guard.save(candidate);workspace=candidate;drafts.clear();importCandidate=null;$('import-dialog').close();renderPlan();renderResults();report('Sicherung lokal ersetzt und zurückgelesen.');}));
 $('import-dialog').addEventListener('close',()=>{importCandidate=null;importToken++;});
 $('clear').addEventListener('click',()=>attempt(()=>{if(!window.confirm('Alle Positionen und Notizen dieser Sammlung leeren? Merkliste bleibt erhalten. Vorher bei Bedarf JSON sichern.'))return;const favorites=workspace.favorites;workspace={...emptyWorkspace(catalog),favorites};drafts.clear();persist();renderPlan();}));
 $('raw-backup').addEventListener('click',()=>{download('alt-speicher-roh.txt',guard.raw===null?'[Speicherschlüssel war nicht vorhanden]':guard.raw,'text/plain');});$('reload').addEventListener('click',()=>{if(window.confirm('Ungesicherte Entwürfe gehen beim Neuladen verloren. JSON bereits gesichert?'))location.reload();});
 window.addEventListener('storage',event=>{if((event.key===STORAGE_KEY||event.key===null)&&event.storageArea===guard.storage){guard.conflict();storageNotice();}});
 for(const s of catalog.sections){const option=node('option',s.title);option.value=s.id;$('section').append(option);}for(const [key,value] of Object.entries(PRICE_LABELS)){const option=node('option',value);option.value=key;$('kind').append(option);}for(const p of pages.pages){const option=node('option','Seite '+p.page);option.value=String(p.page);$('source-page').append(option);}
 const info=$('source-info');info.append(node('p','BAG · Anhang 4 KLV · Ausgabe 1. Juli 2026, publiziert 24. Juni 2026. '+catalog.positions.length+' Quellzeilen aus allen 34 Originalseiten.'),sourceAnchor('Vollständiges amtliches PDF',1),node('p','Abruf: '+provenance.retrieved_at+' · '+provenance.files[0].bytes+' Bytes','meta'),node('p','SHA256: '+catalog.source_sha256,'meta'),node('p','Amtlicher Verordnungstext / Tarif (Art. 5 URG). Keine Übernahme von BAG-Webdesign, Bundeslogo, Drittsoftware oder Herstellerinstrumenten. Das Original-PDF bleibt beim BAG verlinkt.','meta'));
 const list=node('ul');for(const message of catalog.report.warnings)list.append(node('li',message));info.append(list);
 renderResults();renderPlan();$('search').disabled=false;$('workspace').setAttribute('aria-busy','false');document.body.dataset.ready='true';report(catalog.positions.length+' amtliche Quellzeilen geladen · alle Bereiche · Ausgabe 1. Juli 2026');
}
async function load(){
 const fetchJson=async name=>{const response=await fetch(new URL('../data/'+name,import.meta.url));if(!response.ok)throw Error('Katalogdatei nicht verfügbar: '+name+' ('+response.status+')');return response.json();};
 const [c,p,s,r]=await Promise.all(['catalog.json','source-pages.json','provenance.json','import-report.json'].map(fetchJson));catalog=validateCatalog(c);pages=p;provenance=s;
 if(p.source_sha256!==c.source_sha256||p.edition!==c.edition||!Array.isArray(p.pages)||p.pages.length!==34||p.pages.some((p,i)=>p.page!==i+1||typeof p.text!=='string')||s.files?.[0]?.sha256!==c.source_sha256||typeof s.retrieved_at!=='string'||!Number.isInteger(s.files[0].bytes)||s.files[0].bytes<=0||!/^https:\/\/www\.bag\.admin\.ch\/dam\/.*\.pdf$/.test(s.files[0].url)||r.rows!==c.positions.length)throw Error('Quellenpaket ist nicht vollständig oder gehört zu einer anderen Ausgabe.');
 byId=new Map(c.positions.map(p=>[p.id,p]));index=searchIndex(c);let store;try{store=window.localStorage;}catch(e){store={getItem(){throw e;},setItem(){throw e;}};}guard=new StorageGuard(store,c);workspace=structuredClone(guard.workspace);initialize();
}
load().catch(error=>{document.body.dataset.ready='false';$('workspace').setAttribute('aria-busy','false');report('Laden fehlgeschlagen: '+error.message+' · Kein Ersatz-/Beispielkatalog. Seite neu laden oder offizielle ALT-Quelle im Fussbereich öffnen.');});
