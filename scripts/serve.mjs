import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runtimeFiles} from './files.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
export function createAppServer({root=path.join(project,'dist'),basePath='/'}={}){
 if(typeof basePath!=='string'||!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))throw Error('basePath must be a safe slash-delimited path');
 const rootPath=path.resolve(root);
 return http.createServer(async(req,res)=>{
  const security={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
  const send=(code,text)=>{res.writeHead(code,{...security,'content-type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?undefined:text);};
  if(!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host||'')){send(403,'Forbidden host');return;}
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');send(405,'Method not allowed');return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{send(400,'Bad URL');return;}
  if(!pathname.startsWith(basePath)){send(404,'Not found');return;}
  const relative=pathname.slice(basePath.length)||'index.html';if(!Object.hasOwn(runtimeFiles,relative)){send(404,'Not found');return;}
  try{const realRoot=await realpath(rootPath),target=await realpath(path.join(rootPath,relative));if(!target.startsWith(realRoot+path.sep)){send(404,'Not found');return;}const content=await readFile(target);res.writeHead(200,{...security,'content-type':types[path.extname(relative)]||'application/octet-stream','content-length':content.length});res.end(req.method==='HEAD'?undefined:content);}catch{send(404,'Not found');}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const port=Number(process.env.PORT||3012);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');const s=createAppServer({basePath:process.env.BASE_PATH||'/'});s.listen(port,'127.0.0.1',()=>console.log(`ALT: http://127.0.0.1:${port}${process.env.BASE_PATH||'/'}`));}
