import fs from 'node:fs';
import {parseProject} from '../packages/video-schema/src/validate';
import {verifyAssets} from '../apps/renderer/src/media';

async function main() {
  const input = fs.readFileSync(0);
  if (input.length > 512 * 1024 || !process.argv[2]) throw new Error('invalid input');
  const project = parseProject(JSON.parse(input.toString('utf8')));
  await verifyAssets(project, process.argv[2]);
}
main().catch(() => { console.error('project_assets_invalid'); process.exitCode = 1; });
