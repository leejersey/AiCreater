import {isTeachingStyle} from './teaching-style';
export type DraftData = {
  course: {title: string; source: string; audience?: string; duration_hint?: string; outline?: string; teaching_style?: string; manuscript_format?: 'plain'|'markdown'; theme_id?: string};
  voice: {speaker: string};
};
export type DraftKind = keyof DraftData;
export type DraftScope = {kind: DraftKind; projectId: string; sceneId: string; label?: string};
export type DraftRecord<K extends DraftKind = DraftKind> = {
  version: 1; revision: number; updatedAt: number; label: string; data: DraftData[K];
};
export type DraftStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const DRAFT_PREFIX = 'aicreater:draft:v1:';
export const DRAFT_EVENT = 'aicreater-drafts-changed';
export function userDraftPrefix(userId:string):string {
  if(!/^[a-f0-9-]{36}$/i.test(userId))throw new Error('草稿账号无效');
  return 'aicreater:user:'+userId+':';
}
export function userDraftStorage(storage:DraftStorage & Pick<Storage,'length'|'key'>,userId:string):DraftStorage & Pick<Storage,'length'|'key'> {
  const prefix=userDraftPrefix(userId);
  return {
    get length(){return storage.length;},
    key(i){const key=storage.key(i);return key?.startsWith(prefix)?key.slice(prefix.length):null;},
    getItem:key=>storage.getItem(prefix+key),setItem:(key,value)=>storage.setItem(prefix+key,value),
    removeItem:key=>storage.removeItem(prefix+key),
  };
}
const limit = 262144;
const kinds: DraftKind[] = ['course','voice'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function validScope(scope: DraftScope) {
  return kinds.includes(scope.kind) && typeof scope.projectId === 'string' && typeof scope.sceneId === 'string' &&
    (scope.kind === 'course' ? !scope.projectId && !scope.sceneId : !!scope.projectId && !scope.sceneId);
}
export function draftKey(scope: DraftScope): string {
  if (!validScope(scope)) throw new Error('草稿位置不合法');
  return DRAFT_PREFIX + JSON.stringify([scope.kind,scope.projectId,scope.sceneId]);
}
function validData(kind: DraftKind, data: unknown): boolean {
  if (!object(data)) return false;
  const strings = kind === 'course' ? ['title','source'] : ['speaker'];
  if (!strings.every(k=>typeof data[k] === 'string')) return false;
  const allowed = kind==='course'?[...strings,'audience','duration_hint','outline','teaching_style','manuscript_format','theme_id']:strings;
  if (kind === 'course' && !['audience','duration_hint','outline'].every(k=>data[k]===undefined||typeof data[k]==='string')) return false;
  if (kind === 'course' && data.manuscript_format !== undefined && !['plain','markdown'].includes(data.manuscript_format as string)) return false;
  if (kind === 'course' && data.teaching_style !== undefined && !isTeachingStyle(data.teaching_style)) return false;
  if (kind === 'course' && data.theme_id !== undefined && (typeof data.theme_id !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/.test(data.theme_id))) return false;
  return Object.keys(data).every(k=>allowed.includes(k));
}
export function readDraft<K extends DraftKind>(raw: string | null, scope: DraftScope & {kind: K}): DraftRecord<K> | null {
  if (!raw || raw.length > limit) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!object(v) || v.version !== 1 || !Number.isSafeInteger(v.revision) || (v.revision as number) < 0 ||
        typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt) || typeof v.label !== 'string' ||
        !validData(scope.kind,v.data)) return null;
    return v as DraftRecord<K>;
  } catch { return null; }
}
// shortcut: localStorage比较不是跨标签页原子锁；并行编辑需改用IndexedDB事务。
function compare(storage: DraftStorage, scope: DraftScope, expected: string | null) {
  if (storage.getItem(draftKey(scope)) !== expected) throw new Error('其他页面的草稿已变化，本页输入保留；请先复制文本并重新打开，不会覆盖其他草稿。');
}
export function writeDraft<K extends DraftKind>(storage: DraftStorage, scope: DraftScope & {kind: K}, revision: number, data: DraftData[K], expected: string | null): string {
  const raw = JSON.stringify({version:1,revision,updatedAt:Date.now(),label:scope.label ?? scope.kind,data});
  // shortcut: 单份草稿最多256Ki字符；超限保留内存并提醒，支持更长文稿时再调整。
  if (raw.length > limit) throw new Error('草稿过大，无法本机暂存；请复制当前输入。');
  if (!readDraft(raw,scope)) throw new Error('草稿字段不受支持，当前输入未清除。');
  compare(storage,scope,expected); storage.setItem(draftKey(scope),raw);
  return raw;
}
export function removeDraft(storage: DraftStorage, scope: DraftScope, expected: string | null): void {
  compare(storage,scope,expected); storage.removeItem(draftKey(scope));
}
export function clearProjectDrafts(storage: Pick<Storage,'length'|'key'|'removeItem'>, projectId: string): void {
  if (typeof projectId !== 'string' || !projectId) return;
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (!key?.startsWith(DRAFT_PREFIX)) continue;
    try {
      const tuple: unknown = JSON.parse(key.slice(DRAFT_PREFIX.length));
      if (!Array.isArray(tuple) || tuple.length !== 3 || tuple[1] !== projectId) continue;
      storage.removeItem(key);
    } catch { continue; }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DRAFT_EVENT));
}

export function listDrafts(storage: Pick<Storage,'length'|'key'|'getItem'>): {scope: DraftScope; raw: string; record: DraftRecord | null}[] {
  const entries = [];
  for (let i=0;i<storage.length;i++) {
    const key = storage.key(i);
    if (!key?.startsWith(DRAFT_PREFIX)) continue;
    let scope: DraftScope;
    try {
      const tuple: unknown = JSON.parse(key.slice(DRAFT_PREFIX.length));
      if (!Array.isArray(tuple) || tuple.length !== 3) continue;
      scope = {kind:tuple[0],projectId:tuple[1],sceneId:tuple[2]};
      if (!validScope(scope) || draftKey(scope) !== key) continue;
    } catch {continue;}
    const raw = storage.getItem(key);
    if (raw !== null) entries.push({scope,raw,record:readDraft(raw,scope)});
  }
  return entries;
}
