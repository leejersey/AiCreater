export type TeachingStyle = 'popular' | 'technical';
export function outlinePlaceholder(style: TeachingStyle): string {
  return style === 'technical'
    ? '例如：embedding 向量化 → 召回 topK → rerank → 拼上下文生成；越具体越偏干货'
    : '例如：先讲清概念，再用生活例子帮助理解';
}
export function isTeachingStyle(v: unknown): v is TeachingStyle {
  return v === 'popular' || v === 'technical';
}
