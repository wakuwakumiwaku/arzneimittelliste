export const STORAGE_KEY='arzneimittelliste.workspace.v1';
export const SOURCE_SHA256='73a82c5e4dff4a7249c5e9db0c8c6918d006e847949ca4de4ef894c99fc78d2c';
export const PRICE_LABELS={graduated_chf:'Mengenstaffel · CHF exkl. MWST',fixed_chf:'Fixbetrag · CHF exkl. MWST',taxpoints:'Taxpunkte · CHF 1.05/TP exkl. MWST',reference_only:'Sondereinheit · Berechnung offen',unpriced:'Ohne Preis · Verweis'};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function decimal(value,places=6){
 if(typeof value!=='string'||!new RegExp(`^(?:0|[1-9]\\d{0,6})(?:[.,]\\d{1,${places}})?$`).test(value))throw Error('Positive Dezimalzahl ohne Exponent oder Tausenderzeichen erwartet.');
 const [a,b='']=value.replace(',','.').split('.');return {n:BigInt(a+b),d:10n**BigInt(b.length)};
}
export function quantity(value,integer=false){const r=decimal(value);if(r.n<=0n||r.n>1000000n*r.d||(integer&&r.n%r.d!==0n))throw Error(integer?'Anzahl Leistungs-/Gebindeeinheiten: ganze Zahl 1–1 000 000.':'Menge: grösser als 0, höchstens 1 000 000, maximal 6 Nachkommastellen.');return r;}
export function money(cents){if(cents===null)return 'offen';const s=BigInt(cents).toString().padStart(3,'0');return `CHF ${s.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,'’')}.${s.slice(-2)}`;}
export function halfUp(n,d){if(n<0n||d<=0n)throw Error('Ungültiger Rundungsbruch.');return (2n*n+d)/(2n*d);}
export function altRound(n,d){if(n<0n||d<=0n)throw Error('Ungültiger Rundungsbruch.');const block=5n*d;return (n/block)*5n+(n%block>2n*d?5n:0n);}
const cents=v=>{if(typeof v!=='string'||!/^\d+\.\d{2}$/.test(v))throw Error('Ungültiger CHF-Quellbetrag.');return BigInt(v.replace('.',''));};
export function lineAmount(position,value){
 const price=position.price,q=quantity(value,['fixed_chf','taxpoints'].includes(price.kind));
 if(price.kind==='unpriced'||price.kind==='reference_only')return {cents:null,rule:'Kein sicher modellierter Preis für diese Quellzeile; Originalregel prüfen.'};
 if(price.kind==='fixed_chf')return {cents:cents(price.chf)*q.n/q.d,rule:`${value} × ${price.chf} CHF pro ausgewähltem Gebinde / Leistung. Kein zusätzlicher Herstellerpreis oder Margenaufschlag.`};
 if(price.kind==='taxpoints'){
  const p=decimal(price.points),v=decimal(price.chf_per_point);
  return {cents:halfUp(q.n*p.n*v.n*100n,q.d*p.d*v.d),rule:`${value} × ${price.points} TP × CHF ${price.chf_per_point}/TP. Pro Zeile auf Rappen gerundet (Rechenkonvention). Eingeschlossene Arbeiten nicht erneut addieren.`};
 }
 if(price.kind!=='graduated_chf')throw Error('Unbekannte Preisbasis.');
 const cells=price.cells.map(c=>({...c,q:quantity(c.quantity),c:cents(c.chf)}));
 if(!cells.length)return {cents:null,rule:'Keine bezifferte Mengenbasis vorhanden.'};
 const highest=cells.at(-1),comparison=q.n*highest.q.d,base=q.d*highest.q.n;
 if(comparison>=5n*base){
  if(comparison===5n*base)return {cents:altRound(highest.c*9n,2n),rule:'1.7.2 d: genau 5 × höchste Mengenbasis → 4.5 × höchster Preis; danach 1.7.2 c.'};
  if(comparison===10n*base)return {cents:altRound(highest.c*8n,1n),rule:'1.7.2 d: genau 10 × höchste Mengenbasis → 8 × höchster Preis; danach 1.7.2 c.'};
  return {cents:null,rule:'1.7.2 d nennt Fünf-/Zehnfaches. Andere Mengen ab 5 × höchster Ansatz werden hier nicht interpoliert; Originalregel manuell prüfen.'};
 }
 let index=0;for(let i=0;i<cells.length;i++)if(q.n*cells[i].q.d>=cells[i].q.n*q.d)index=i;
 const chosen=cells[index];let n=chosen.c*q.n*chosen.q.d,d=q.d*chosen.q.n;
 const next=cells[index+1];let capped=false;
 if(next&&n>next.c*d){n=next.c;d=1n;capped=true;}
 if(n<10n*d){n=10n;d=1n;}
 return {cents:altRound(n,d),rule:`1.7.2 a–c: proportional zu ${chosen.quantity} → CHF ${chosen.chf}${capped?`; gedeckelt auf nächsthöheren Ansatz CHF ${next.chf}`:''}; Minimum 10 Rp.; bis 2 Rp. abrunden, über 2 Rp. auf nächste 5 Rp.`};
}
export function totals(lines,byId){let cents=0n,unresolved=0;const results=lines.map(l=>{const p=byId.get(l.id);let r;try{r=p?lineAmount(p,l.quantity):{cents:null,rule:'Unbekannte Position'};}catch(e){r={cents:null,rule:e.message};}if(r.cents===null)unresolved++;else cents+=r.cents;return {line:l,position:p,...r};});return {cents,unresolved,complete:unresolved===0,results};}
export function normalize(s){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss');}
export function searchIndex(c){const rules=new Map(c.rules.map(r=>[r.id,normalize(r.text)]));return new Map(c.positions.map(p=>[p.id,normalize([p.id,p.code,p.title,p.unit,p.notes,...p.hierarchy,...p.flags,PRICE_LABELS[p.price.kind]].join(' '))+' '+p.rule_ids.map(id=>rules.get(id)||'').join(' ')]));}
export function filterPositions(c,index,{query='',section='',kind='',flag='',favoritesOnly=false,favorites=[]}={}){const tokens=normalize(query).trim().split(/\s+/).filter(Boolean),starred=new Set(favorites);return c.positions.filter(p=>(!section||p.section===section)&&(!kind||p.price.kind===kind)&&(!flag||p.flags.includes(flag))&&(!favoritesOnly||starred.has(p.id))&&tokens.every(t=>index.get(p.id).includes(t)));}
export function emptyWorkspace(c){return {app:'arzneimittelliste.workspace',version:1,edition:c.edition,sourceSha256:c.source_sha256,name:'Meine Zusammenstellung',note:'',lines:[],favorites:[]};}
export function validateWorkspace(v,c){
 const expected=emptyWorkspace(c),ids=new Map(c.positions.map(p=>[p.id,p]));
 if(!exact(v,Object.keys(expected))||v.app!==expected.app||v.version!==1||v.edition!==expected.edition||v.sourceSha256!==expected.sourceSha256)throw Error('Keine ALT-Sicherung dieser Ausgabe / Quellversion.');
 if(typeof v.name!=='string'||v.name.length>120||typeof v.note!=='string'||v.note.length>10000||!Array.isArray(v.lines)||v.lines.length>1000||!Array.isArray(v.favorites)||v.favorites.length>c.positions.length)throw Error('Ungültiger Name, Notiz oder Umfang.');
 const seen=new Set();const lines=v.lines.map(l=>{if(!exact(l,['id','quantity','note'])||typeof l.id!=='string'||!ids.has(l.id)||typeof l.note!=='string'||l.note.length>2000||seen.has(l.id))throw Error('Unbekannte, doppelte oder ungültige Position.');quantity(l.quantity,['taxpoints','fixed_chf'].includes(ids.get(l.id).price.kind));seen.add(l.id);return {...l};});
 const stars=new Set();for(const id of v.favorites){if(typeof id!=='string'||!ids.has(id)||stars.has(id))throw Error('Ungültige oder doppelte Merkliste.');stars.add(id);}
 return {...expected,name:v.name,note:v.note,lines,favorites:[...stars]};
}
export class StorageGuard{
 constructor(storage,catalog){this.storage=storage;this.catalog=catalog;this.raw=null;this.readable=false;this.locked=false;this.reason='';this.workspace=emptyWorkspace(catalog);try{this.raw=storage.getItem(STORAGE_KEY);this.readable=true;if(this.raw!==null)this.workspace=validateWorkspace(JSON.parse(this.raw),catalog);}catch(e){this.locked=true;this.reason='Lokaler Speicher nicht lesbar oder beschädigt. Kein automatisches Überschreiben. '+e.message;}}
 save(workspace){const candidate=validateWorkspace(workspace,this.catalog);if(this.locked)throw Error(this.reason);try{if(this.storage.getItem(STORAGE_KEY)!==this.raw)throw Error('Fremdänderung erkannt. Dieser Entwurf bleibt erhalten; JSON sichern und neu laden.');const raw=JSON.stringify(candidate);this.storage.setItem(STORAGE_KEY,raw);if(this.storage.getItem(STORAGE_KEY)!==raw)throw Error('Speicherprüfung fehlgeschlagen.');this.raw=raw;this.workspace=candidate;}catch(e){this.locked=true;this.reason=e.message;throw e;}}
 conflict(){this.locked=true;this.reason='Ein anderer Tab hat den lokalen Speicher geändert. Entwurf bleibt erhalten; vor Neuladen JSON sichern.';}
}
export function csvCell(v){let s=String(v??'');if(/^[\s]*[=+\-@]/u.test(s)||/^[\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function workspaceCsv(w,c){
 const t=totals(w.lines,new Map(c.positions.map(p=>[p.id,p]))),out=[['Zusammenstellung',w.name],['Notiz',w.note],['Ausgabe',c.edition],['Original-SHA256',c.source_sha256],['Interne Quellzeilen-ID','Quellcode (falls vorhanden)','Bezeichnung','Menge','Einheit / Leistungsblock','Preisbasis','Zeile CHF exkl. MWST','Rechenweg / offene Regel','Originalhinweis','Hierarchie','Persönliche Notiz','PDF-Seite']];
 for(const r of t.results){const p=r.position;out.push([p.id,p.code,p.title,r.line.quantity,p.unit,PRICE_LABELS[p.price.kind],r.cents===null?'OFFEN':`${r.cents/100n}.${(r.cents%100n).toString().padStart(2,'0')}`,r.rule,p.notes,p.hierarchy.join(' > '),r.line.note,p.source.pdf_page]);}
 out.push([t.complete?'Teilsumme der ausgewählten Zeilen':'UNVOLLSTÄNDIGE Teilsumme',money(t.cents),`${t.unresolved} offen`],['Keine Abrechnungs-/Erstattungszusage. Keine MWST, kein Rezepturminimum, keine automatischen Zuschläge.']);return '\uFEFF'+out.map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
export function validateCatalog(c){
 if(!object(c)||c.schema!==1||c.edition!=='2026-07-01'||c.source_sha256!==SOURCE_SHA256||!Array.isArray(c.positions)||!Array.isArray(c.sections)||!Array.isArray(c.rules))throw Error('Ungültiges Katalogformat.');
 const ids=new Set(),sections=new Set(c.sections.map(s=>s.id)),rules=new Set(c.rules.map(r=>r.id));
 for(const r of c.rules)if(typeof r.id!=='string'||typeof r.title!=='string'||typeof r.text!=='string'||!Array.isArray(r.pages)||r.pages.some(n=>!Number.isInteger(n)||n<1||n>34))throw Error('Ungültige Quellregel.');
 for(const p of c.positions){
  if(!object(p)||typeof p.id!=='string'||!/^[a-zA-Z0-9-]+$/.test(p.id)||ids.has(p.id)||typeof p.title!=='string'||!p.title||typeof p.code!=='string'||typeof p.unit!=='string'||typeof p.notes!=='string'||!sections.has(p.section)||!Array.isArray(p.hierarchy)||p.hierarchy.some(s=>typeof s!=='string')||!Array.isArray(p.flags)||p.flags.some(s=>!['L','St'].includes(s))||!Array.isArray(p.rule_ids)||p.rule_ids.some(id=>!rules.has(id))||!object(p.source)||!Number.isInteger(p.source.pdf_page)||p.source.pdf_page<1||p.source.pdf_page>34||!Number.isFinite(p.source.y_min)||!Number.isFinite(p.source.y_max)||p.source.y_min<0||p.source.y_max<p.source.y_min)throw Error('Ungültige oder doppelte Quellposition.');
  ids.add(p.id);if(!object(p.price)||typeof p.price.kind!=='string'||!Object.hasOwn(PRICE_LABELS,p.price.kind))throw Error('Unbekannte Preisart.');
  const a=p.price;if(a.kind==='taxpoints'){quantity(a.points);if(a.chf_per_point!=='1.05')throw Error('Taxpunktwert abweichend.');}else if(a.kind==='fixed_chf'){cents(a.chf);if(a.manufacturer_chf!==undefined)cents(a.manufacturer_chf);}else{if(!Array.isArray(a.cells))throw Error('Staffeln fehlen.');if(a.kind==='graduated_chf'&&a.cells.length===0)throw Error('Leere CHF-Staffel.');let prev={n:0n,d:1n};for(const cell of a.cells){const q=quantity(cell.quantity);cents(cell.chf);if(q.n*prev.d<=prev.n*q.d)throw Error('Nicht aufsteigende Staffel.');prev=q;}}
 }
 if(c.report.rows!==c.positions.length||c.positions.length!==917)throw Error('Katalogumfang nicht vollständig.');
 return c;
}
