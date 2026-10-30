import path from 'node:path';
import {parseMotionAssembly,assembleMotionScene,motionAssemblyHash} from '../packages/custom-scenes/src/motion-assembly';
import {sourceHash} from '../packages/custom-scenes/src/contract';
import {readJson,ensureOutputAbsent,publishText,saveGeneratedCandidate} from '../packages/custom-scenes/src/files';

const [inputFile,outputFile,...extra]=process.argv.slice(2);
if(!inputFile||!outputFile||extra.length)throw Error('Usage: npm run visual:assemble-motion -- assembly.json output.json');
const output=path.resolve(outputFile);
for(const suffix of ['', '.check.json','.assembly-input.json','.assembly-provenance.json'])await ensureOutputAbsent(output+suffix);
const input=parseMotionAssembly(await readJson(inputFile));
const artifact=await assembleMotionScene(input);
await saveGeneratedCandidate(artifact,output);
await publishText(output+'.assembly-input.json',JSON.stringify(input,null,2)+'\n');
const provenance={schemaVersion:'motion-assembly-provenance:1',inputSha256:motionAssemblyHash(input),sourceSha256:sourceHash(artifact),assembly:'trusted-host',modelRequests:0,ttsRequests:0,executed:false,visual:'pending',accepted:false};
await publishText(output+'.assembly-provenance.json',JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({output,...provenance}));
