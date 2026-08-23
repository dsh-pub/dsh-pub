import type { Locale } from './i18n.js';

export type UiContribution = {
  slot: string;
  id?: string;
  component?: string;
};

export type ModelTool = {
  name: string;
  description?: string;
  writes?: string[];
};

export type CapabilityKind = 'ui' | 'tool';

export type CapabilityTableRow = {
  kind: CapabilityKind;
  kindLabel: string;
  kindTooltip: string;
  value: string;
  valueHint?: string;
};

/** Known Cordis UI slots → where they appear in the product UI. */
const SLOT_LOCATIONS: Record<string, { en: string; zh: string }> = {
  'sidebar.workspaces.row-menu': {
    en: 'Workspace sidebar row menu (⋯)',
    zh: '工作区侧栏行菜单（⋯）',
  },
  'conversation.input.dock': {
    en: 'Conversation composer dock',
    zh: '对话输入区扩展位',
  },
  'settings.section': {
    en: 'Settings page section',
    zh: '设置页分区',
  },
  'conversation.view': {
    en: 'Conversation main view',
    zh: '对话主视图',
  },
  'conversation.composer': {
    en: 'Conversation composer',
    zh: '对话输入框',
  },
  'tool.call.toolview': {
    en: 'Tool-call result view',
    zh: '工具调用结果视图',
  },
};

const SLOT_PREFIX_LOCATIONS: Array<{ prefix: string; en: string; zh: string }> = [
  { prefix: 'sidebar.', en: 'Sidebar', zh: '侧栏' },
  { prefix: 'settings.', en: 'Settings', zh: '设置' },
  { prefix: 'conversation.', en: 'Conversation UI', zh: '对话界面' },
  { prefix: 'tool.', en: 'Tool UI', zh: '工具界面' },
];

const KIND_COPY: Record<
  CapabilityKind,
  { label: { en: string; zh: string }; tip: { en: string; zh: string } }
> = {
  ui: {
    label: { en: 'UI', zh: '界面' },
    tip: {
      en: 'A visible entry or view this plugin adds to the DeepSeek Harness web UI.',
      zh: '插件在 DeepSeek Harness Web 界面中增加的可见入口或视图。',
    },
  },
  tool: {
    label: { en: 'Model tool', zh: '模型工具' },
    tip: {
      en: 'A tool the model can call during a session after this plugin is loaded.',
      zh: '加载此插件后，模型在会话中可以调用的工具。',
    },
  },
};

export function uiSlotLocation(slot: string, locale: Locale): string {
  const exact = SLOT_LOCATIONS[slot];
  if (exact) return exact[locale];
  const prefix = SLOT_PREFIX_LOCATIONS.find((item) => slot.startsWith(item.prefix));
  if (prefix) return prefix[locale];
  return locale === 'zh' ? `界面插槽 ${slot}` : `UI slot ${slot}`;
}

export function buildCapabilityTableRows(options: {
  locale: Locale;
  tools?: ModelTool[] | null;
  uiContributions?: UiContribution[] | null;
}): CapabilityTableRow[] {
  const { locale, tools = null, uiContributions = null } = options;
  const rows: CapabilityTableRow[] = [];

  for (const item of uiContributions ?? []) {
    const detail = [item.component, item.id].filter(Boolean).join(' · ');
    rows.push({
      kind: 'ui',
      kindLabel: KIND_COPY.ui.label[locale],
      kindTooltip: KIND_COPY.ui.tip[locale],
      value: uiSlotLocation(item.slot, locale),
      valueHint: [detail, item.slot].filter(Boolean).join(' · ') || undefined,
    });
  }

  for (const tool of tools ?? []) {
    rows.push({
      kind: 'tool',
      kindLabel: KIND_COPY.tool.label[locale],
      kindTooltip: KIND_COPY.tool.tip[locale],
      value: tool.name,
      valueHint: tool.description?.trim() || undefined,
    });
  }

  return rows;
}
