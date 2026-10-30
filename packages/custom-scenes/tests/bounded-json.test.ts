import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readBoundedJsonBytes} from '../src/files';

test('JSON evidence reading is bounded and rejects devices, directories and symlinks',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bounded-json-'));
 try{
  const file=path.join(dir,'data.json'),link=path.join(dir,'link.json');
  const bytes=Buffer.from('{"value":"measured"}');await writeFile(file,bytes);
  assert.deepEqual(await readBoundedJsonBytes(file),bytes);
  await symlink(file,link);await assert.rejects(readBoundedJsonBytes(link));
  await assert.rejects(readBoundedJsonBytes(dir),/regular file/);
  if(process.platform!=='win32')await assert.rejects(readBoundedJsonBytes('/dev/zero'),/regular file/);
  await writeFile(file,Buffer.alloc(256*1024+1));await assert.rejects(readBoundedJsonBytes(file),/256 KiB/);
  await writeFile(file,Buffer.alloc(256*1024));assert.equal((await readBoundedJsonBytes(file)).length,256*1024);
 }finally{await rm(dir,{recursive:true,force:true});}
});
