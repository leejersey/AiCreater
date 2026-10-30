import {readFile} from 'node:fs/promises';
import {parseArtifact,sourceHash} from '../packages/custom-scenes/src/contract';
import {checkMotionBindings} from '../packages/custom-scenes/src/motion-bindings';

const [file,...ids]=process.argv.slice(2);
if(!file||!ids.length||ids.some(id=>! /^[a-z][a-z0-9-]{0,63}$/.test(id)))throw Error('Usage: npm run visual:motion-check -- artifact.json object-id [object-id...]');
const artifact=parseArtifact(JSON.parse(await readFile(file,'utf8')));
try{
 checkMotionBindings(artifact.source,ids);
 console.log(JSON.stringify({sha256:sourceHash(artifact),binding:'passed',executed:false,accepted:false}));
}catch(error){
 console.log(JSON.stringify({sha256:sourceHash(artifact),binding:'failed',detail:error instanceof Error?error.message:String(error),executed:false,accepted:false}));
 process.exitCode=1;
}
