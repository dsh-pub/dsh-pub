import type { Locale } from './i18n.js';

export const categoryOrder = [
  'ui',
  'tool',
  'model',
  'storage',
  'workflow',
  'session',
  'runtime',
  'other',
] as const;

const labels: Record<string, { en: string; zh: string }> = {
  ui: { en: 'UI & client', zh: 'UI 与客户端' },
  'client-ui': { en: 'UI & client', zh: 'UI 与客户端' },
  tool: { en: 'Model tools', zh: '模型工具' },
  tools: { en: 'Model tools', zh: '模型工具' },
  model: { en: 'Models', zh: '模型接入' },
  models: { en: 'Models', zh: '模型接入' },
  storage: { en: 'Storage', zh: '存储' },
  workflow: { en: 'Workflow', zh: '工作流' },
  session: { en: 'Sessions', zh: '会话' },
  sessions: { en: 'Sessions', zh: '会话' },
  runtime: { en: 'Runtime', zh: '运行时' },
  orchestration: { en: 'Orchestration', zh: '编排' },
  platform: { en: 'Platform', zh: '平台' },
  core: { en: 'Core', zh: '核心能力' },
  bundles: { en: 'Bundles', zh: '组合包' },
  bundle: { en: 'Bundles', zh: '组合包' },
  plugin: { en: 'Plugins', zh: '插件' },
  seam: { en: 'Seams', zh: '接缝' },
  library: { en: 'Libraries', zh: '库' },
  other: { en: 'Other', zh: '其他' },
};

export function categoryLabel(category: string, locale: Locale): string {
  return labels[category]?.[locale] ?? category;
}

export function typeLabel(type: string, locale: Locale): string {
  return labels[type]?.[locale] ?? type;
}
