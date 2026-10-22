import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,rm,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {imageProject} from '../../../packages/video-schema/tests/images-fixture';
import {parseProject} from '../../../packages/video-schema/src/validate';
import {verifyAssets} from '../src/media';

test('private image verification decodes static PNG/JPEG and rejects dimension/type/size/corruption',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'teaching-images-'));
  try{
    for(const extension of ['png','jpg']){
      const file=path.join(root,`toolbox.${extension}`);
      execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x64','-frames:v','1',file]);
      const p=parseProject(imageProject());p.assets=p.assets.filter(a=>a.type==='image');
      const asset=p.assets[0];assert.ok(asset.type==='image');
      asset.width=64;asset.height=64;asset.storage_key=`toolbox.${extension}`;
      asset.checksum=createHash('sha256').update(await readFile(file)).digest('hex');
      await verifyAssets(p,root);
      asset.width=65;await assert.rejects(verifyAssets(p,root),/image_dimensions/);asset.width=64;
      const bad=path.join(root,'bad.'+extension);await writeFile(bad,Buffer.from('not an image'));
      asset.storage_key='bad.'+extension;asset.checksum=createHash('sha256').update(await readFile(bad)).digest('hex');
      await assert.rejects(verifyAssets(p,root));
    }
    const p=parseProject(imageProject());p.assets=p.assets.filter(a=>a.type==='image');
    const asset=p.assets[0];asset.storage_key='oversize.png';
    const big=await open(path.join(root,'oversize.png'),'w');await big.truncate(10*1024*1024+1);await big.close();
    await assert.rejects(verifyAssets(p,root),/asset_size/);
    const gif=path.join(root,'animated.png');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=64x64:rate=2:duration=1','-f','gif',gif]);
    asset.storage_key='animated.png';asset.checksum=createHash('sha256').update(await readFile(gif)).digest('hex');
    await assert.rejects(verifyAssets(p,root),/image_type/);
    const file=path.join(root,'toolbox.png');const truncated=(await readFile(file)).subarray(0,40);
    await writeFile(path.join(root,'broken.png'),truncated);asset.storage_key='broken.png';
    asset.checksum=createHash('sha256').update(truncated).digest('hex');
    await assert.rejects(verifyAssets(p,root));
  }finally{await rm(root,{recursive:true,force:true});}
});
