export declare const directoryTopicIds: readonly ["ui-client", "model-tools", "models", "storage", "workflow", "sessions", "runtime", "other"];
export type DirectoryTopic = (typeof directoryTopicIds)[number];
export type DirectorySurface = 'host' | 'client' | 'profile';
export type DirectoryProvenance = 'built-in' | 'community';
export type DirectoryEntryType = 'plugin' | 'bundle';
export type DirectorySort = 'name' | 'topic' | 'source' | 'capabilities';
export interface DirectoryEntry {
    slug: string;
    name: string;
    description: {
        en: string;
        zh: string;
    };
    topic: DirectoryTopic;
    category: string;
    type: DirectoryEntryType;
    provenance: DirectoryProvenance;
    surfaces: DirectorySurface[];
    installable: boolean;
    capabilityCount: number;
    repository: string;
    directory: string;
    commit: string;
}
export interface DirectoryQuery {
    search: string;
    topic: 'all' | DirectoryTopic;
    provenance: 'all' | DirectoryProvenance;
    surface: 'all' | Exclude<DirectorySurface, 'profile'> | 'hybrid';
    distribution: 'all' | 'installable' | 'included';
    type: 'all' | DirectoryEntryType;
    sort: DirectorySort;
    page: number;
    pageSize: number;
}
export interface DirectoryResult {
    entries: DirectoryEntry[];
    total: number;
    page: number;
    pageCount: number;
}
export declare const defaultDirectoryQuery: DirectoryQuery;
export declare function queryDirectory(sourceEntries: readonly DirectoryEntry[], query: DirectoryQuery): DirectoryResult;
export declare function topicCounts(entries: readonly DirectoryEntry[]): Record<'all' | DirectoryTopic, number>;
