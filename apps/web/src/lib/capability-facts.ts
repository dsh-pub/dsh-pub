import type { CatalogEntry } from './catalog-types.js';

export const capabilityLabels = {
  host: { en: 'Host-loadable', zh: '宿主可加载' },
  client: { en: 'Web client', zh: 'Web 客户端' },
  ui: { en: 'UI surface', zh: '界面贡献' },
  tool: { en: 'Model tools', zh: '模型工具' },
  data: { en: 'Data & storage', zh: '数据与存储' },
  flow: { en: 'Workflow', zh: '流程编排' },
} as const;

export type CapabilityId = keyof typeof capabilityLabels;

/**
 * Topic auto-analysis does not execute plugins, so tools / UI stay null until
 * inspected. Treat those nulls as unverified rather than absent.
 */
export function confirmedCapabilities(entry: CatalogEntry): CapabilityId[] {
  const factsUnknown =
    entry.runtime.hostLoadable === null ||
    entry.capabilities.tools === null ||
    entry.capabilities.uiContributions === null;
  const hasClient = factsUnknown ? null : Boolean(entry.runtime.client);
  const hasUi = factsUnknown
    ? null
    : hasClient ||
      (entry.capabilities.uiContributions?.length ?? 0) > 0 ||
      ['ui', 'client-ui'].includes(entry.category);
  const hasTool = factsUnknown
    ? null
    : (entry.capabilities.tools?.length ?? 0) > 0 || ['tool', 'tools'].includes(entry.category);
  const hasData = factsUnknown ? null : ['storage', 'session', 'sessions'].includes(entry.category);
  const hasFlow = factsUnknown
    ? null
    : ['workflow', 'orchestration', 'session', 'sessions'].includes(entry.category) ||
      entry.type === 'bundle';

  return (
    [
      ['host', entry.runtime.hostLoadable],
      ['client', hasClient],
      ['ui', hasUi],
      ['tool', hasTool],
      ['data', hasData],
      ['flow', hasFlow],
    ] as const
  )
    .filter(([, state]) => state === true)
    .map(([id]) => id);
}
