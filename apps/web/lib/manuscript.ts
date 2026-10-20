export function canGenerate(v: {title: string; source: string}): boolean {
  return v.title.trim().length > 0;
}
export function needsOverwriteConfirm(source: string): boolean {
  return source.trim().length > 0;
}
export function createButtonLabel(busy: boolean): string {
  return busy ? '正在创建…' : '确认讲稿并创建草稿';
}
