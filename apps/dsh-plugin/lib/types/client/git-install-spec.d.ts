import type { DirectoryEntry } from './catalog-query.js';
export type DirectoryInstallCoordinates = Pick<DirectoryEntry, 'installable' | 'repository' | 'directory' | 'commit'>;
/** pnpm git spec for one catalog row, pinned to the recorded commit. */
export declare function directoryGitInstallSpec(entry: DirectoryInstallCoordinates): string | null;
