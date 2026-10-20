export type Account={id:string;username:string};
export const AUTH_REQUIRED='aicreater-auth-required';
export function parseAccount(value:unknown):Account {
  if(!value||typeof value!=='object'||!('id' in value)||!('username' in value)||typeof value.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id)||typeof value.username!=='string'||!/^\w{3,32}$/.test(value.username))throw new Error('账号响应无效');
  return {id:value.id,username:value.username};
}
export function safeReturn(path:string|null):string {
  return path&&/^(?:\/courses(?:\/(?:new|[a-f0-9-]{36}))?(?:\?[^#\\]*)?|\/account)$/i.test(path)?path:'/courses';
}
