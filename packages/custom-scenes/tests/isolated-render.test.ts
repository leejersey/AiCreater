import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {repositoryRoot} from '../src/files';
import {isolatedRenderCommand,teachingContainerName} from '../src/isolated-render';
test('isolated command has no host mount or network, restricts resources and maps only job paths',()=>{
 const root='/tmp/frozen-job';
 const args=[path.join(repositoryRoot,'scripts/render-custom-scene.ts'),root+'/chapter-0/artifact.json',root+'/stills','--approve='+'a'.repeat(64),'--stills-only','--design='+root+'/chapter-0/artifact.json.design.json'];
 const command=isolatedRenderCommand(args,root,'test');
 for(const flag of ['--network','--cap-drop','--security-opt','--memory','--cpus','--pids-limit','--user'])assert.ok(command.includes(flag));
 assert.equal(command[command.indexOf('--network')+1],'none');
 assert.ok(!command.some(v=>v.includes(root)||v==='--mount'||v==='-v'||v==='--privileged'));
 assert.ok(command.includes('/work/job/chapter-0/artifact.json'));
 assert.throws(()=>isolatedRenderCommand([args[0],'/etc/passwd'],root,'test'),/escapes/);
 assert.throws(()=>isolatedRenderCommand(['/bin/sh'],root,'test'),/entry/);
});
test('durable teaching job has a deterministic owned container identity',()=>{
 const id='11111111-1111-4111-8111-111111111111',root='/tmp/'+id;
 assert.equal(teachingContainerName(id),'aicreater-teaching-'+id);
 assert.throws(()=>teachingContainerName('../other'),/identity/);
 const command=isolatedRenderCommand([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),root+'/input.json',root+'/render'],root,teachingContainerName(id));
 assert.ok(command.includes('aicreater.teaching-job='+id));
});
test('teaching data rendering uses a separate image and only frozen input/output paths',()=>{
 const root='/tmp/frozen-teaching',entry=path.join(repositoryRoot,'scripts/teaching-render-container.ts');
 const command=isolatedRenderCommand([entry,root+'/input.json',root+'/render'],root,'teaching-test');
 assert.ok(command.includes('aicreater-teaching-renderer:local'));
 assert.ok(command.includes('/work/job/input.json'));assert.ok(command.includes('/work/job/render'));
 assert.ok(!command.includes('aicreater-renderer:local'));
 assert.throws(()=>isolatedRenderCommand([entry,root+'/input.json','/tmp/other'],root,'test'),/teaching paths/);
 assert.throws(()=>isolatedRenderCommand([entry,root+'/input.json',root+'/render','--approve='+'a'.repeat(64)],root,'test'),/teaching/);
});
