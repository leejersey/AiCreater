import type {Element} from './types';

export const conceptLabels = {definition:'定义',feature:'特征',example:'例证',summary:'总结'} satisfies Record<NonNullable<Element['concept_role']>,string>;
