// The scene kit (packages/scene-kit/kit.tsx): building blocks a scene may import as './kit'. Each Agent job freezes
// the copy it was checked and rendered with (published as kit.txt), so later re-renders use that same copy.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const KIT_MODULE='./kit';
export const KIT_PATH=path.join(fileURLToPath(new URL('../../../',import.meta.url)),'packages/scene-kit/kit.tsx');
/** The kit as it is in the repository now. */
export const currentKit=()=>readFile(KIT_PATH,'utf8');
/** Whether a scene imports the kit (checkSource has already limited imports to react, remotion and './kit'). */
export const usesKit=(source:string)=>/\bfrom\s*['"]\.\/kit['"]/.test(source);
