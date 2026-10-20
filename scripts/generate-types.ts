import {compileFromFile} from 'json-schema-to-typescript';
import {mkdir, writeFile} from 'node:fs/promises';

await mkdir('packages/video-schema/src', {recursive: true});
await writeFile('packages/video-schema/src/types.ts', await compileFromFile('packages/video-schema/schema.json', {
  bannerComment: '/* Generated from schema.json by npm run schema:types. Do not edit. */',
  additionalProperties: false,
  ignoreMinAndMaxItems: true,
}));
