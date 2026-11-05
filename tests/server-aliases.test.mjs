import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAppServer} from '../scripts/serve.mjs';

for(const kind of ['leaf','ancestor'])test(`runtime allowlist refuses same-root ${kind} symlink aliases`,async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'runtime-alias-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'.local'),{recursive:true});
 await writeFile(path.join(root,'index.html'),'SYNTHETIC public control');
 await writeFile(path.join(root,'.local/app.js'),'SYNTHETIC PRIVATE CANARY');
 if(kind==='leaf'){
  await mkdir(path.join(root,'src'));
  await symlink('../.local/app.js',path.join(root,'src/app.js'));
 }else await symlink('.local',path.join(root,'src'));
 const server=createAppServer({root,basePath:'/fixture/'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const control=await fetch(origin+'/fixture/');
 assert.equal(control.status,200);assert.equal(await control.text(),'SYNTHETIC public control');
 for(const method of ['GET','HEAD']){
  const response=await fetch(origin+'/fixture/src/app.js',{method});
  const text=await response.text();
  assert.equal(response.status,404,`${method} must refuse allowlisted alias into ignored private files`);
  assert.ok(!text.includes('PRIVATE CANARY'));
 }
 assert.equal((await fetch(origin+'/fixture/.local/app.js')).status,404);
 assert.equal(await readFile(path.join(root,'.local/app.js'),'utf8'),'SYNTHETIC PRIVATE CANARY');
 await rm(path.join(root,'src'),{recursive:true,force:true});
 await mkdir(path.join(root,'src'));await writeFile(path.join(root,'src/app.js'),'SYNTHETIC regular public script');
 const regular=await fetch(origin+'/fixture/src/app.js');
 assert.equal(regular.status,200);assert.equal(await regular.text(),'SYNTHETIC regular public script');
 const head=await fetch(origin+'/fixture/src/app.js',{method:'HEAD'});
 assert.equal(head.status,200);assert.equal(await head.text(),'');
});
