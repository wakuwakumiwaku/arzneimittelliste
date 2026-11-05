import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,rename,symlink,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeFiles} from '../scripts/files.mjs';
import {build} from '../scripts/build.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'alt-input-ancestor-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const source of Object.values(runtimeFiles)){const dest=path.join(root,source);await mkdir(path.dirname(dest),{recursive:true});await cp(path.join(project,source),dest);}
 return root;
}
for(const source of ['src','public','public/data'])test(`build refuses symlinked ${source} ancestor before replacing previous output`,async t=>{
 const root=await fixture(t);await build({root});await writeFile(path.join(root,'dist/previous-marker'),'SYNTHETIC last good output');
 const before=await readFile(path.join(root,'dist/src/app.js'));
 await mkdir(path.join(root,'.local'));const alias=path.join(root,'.local/input');
 await rename(path.join(root,source),alias);await symlink(alias,path.join(root,source));
 await assert.rejects(()=>build({root}),/symlink|directory|regular/i,'symlinked runtime ancestors must not publish ignored files');
 assert.equal(await readFile(path.join(root,'dist/previous-marker'),'utf8'),'SYNTHETIC last good output');
 assert.deepEqual(await readFile(path.join(root,'dist/src/app.js')),before);
 assert.ok(!(await readdir(root)).some(n=>n.startsWith('.build-')));
 await rm(path.join(root,source));await rename(alias,path.join(root,source));
 await build({root});assert.deepEqual(await readFile(path.join(root,'dist/src/app.js')),await readFile(path.join(root,'src/app.js')));
});
