import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=process.env.ALT_TEST_ROOT||fileURLToPath(new URL('../',import.meta.url));
const helper=fileURLToPath(new URL('./helpers/import-intent.mjs',import.meta.url));
for(const scenario of ['old-error-new-preview','old-error-after-confirm','current-read-error','current-invalid-json','old-success-new-preview']){
 test('import intent: '+scenario,()=>{
  const result=spawnSync(process.execPath,['--experimental-vm-modules',helper,root,scenario],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  assert.match(result.stdout,/"passed":true/);
 });
}
