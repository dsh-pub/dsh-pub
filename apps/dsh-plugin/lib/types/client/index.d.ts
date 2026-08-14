import type { DshClientContext } from './dsh-contract.js';
export { DirectorySection } from './DirectorySection.js';
export type { DirectorySectionProps } from './dsh-contract.js';
/** Required DSH client services. */
export declare const inject: string[];
/** Register the bilingual dsh.pub directory as one DSH Settings section. */
export declare function apply(ctx: DshClientContext): void;
