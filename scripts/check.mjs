import {readFile,lstat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {publicMembers,runtimeFiles} from './files.mjs';
import {project,validatedInputs} from './build.mjs';
if(Number(process.versions.node.split('.')[0])<22)throw Error('Node >=22 required');
await validatedInputs();
if(new Set(publicMembers).size!==publicMembers.length)throw Error('Duplicate public members');
for(const p of publicMembers){const s=await lstat(path.join(project,p));if(!s.isFile()||s.isSymbolicLink())throw Error('Missing regular public member: '+p);if(/\.(?:mjs|js)$/.test(p))execFileSync(process.execPath,['--check',p],{cwd:project,stdio:'pipe'});}
const html=await readFile(path.join(project,'index.html'),'utf8'),links=[...html.matchAll(/href="(https:\/\/wakuwakumiwaku\.github\.io\/[^" ]+)"/g)].map(m=>m[1]);
if(links.length!==9||new Set(links).size!==9||[...html.matchAll(/aria-current="page"/g)].length!==1)throw Error('Catalog navigation contract');
const src=await readFile(path.join(project,'src/app.js'),'utf8');if(/innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(/.test(src))throw Error('Unsafe DOM sink');
for(const key of ['search','results','detail-dialog','more','reset'])if(!html.includes(`id="${key}"`))throw Error('Missing UI contract: '+key);
console.log(`check: ${publicMembers.length} public members; ${Object.keys(runtimeFiles).length} runtime files; 917 source rows; navigation/DOM/syntax/data validated`);
