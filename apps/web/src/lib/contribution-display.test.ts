import { describe, expect, it } from 'vitest';

import { buildCapabilityTableRows, uiSlotLocation } from './contribution-display.js';

describe('contribution display', () => {
  it('maps known slots to product UI locations', () => {
    expect(uiSlotLocation('sidebar.workspaces.row-menu', 'zh')).toBe('工作区侧栏行菜单（⋯）');
    expect(uiSlotLocation('settings.section', 'en')).toBe('Settings page section');
  });

  it('falls back by slot prefix for unknown slots', () => {
    expect(uiSlotLocation('sidebar.custom.thing', 'zh')).toBe('侧栏');
    expect(uiSlotLocation('mystery.slot', 'en')).toBe('UI slot mystery.slot');
  });

  it('builds table rows with kind tooltips', () => {
    expect(
      buildCapabilityTableRows({
        locale: 'zh',
        uiContributions: [{ slot: 'sidebar.workspaces.row-menu', component: 'OpenInVscodeRow' }],
        tools: [{ name: 'bash', description: 'Run a shell command.' }],
      }),
    ).toEqual([
      {
        kind: 'ui',
        kindLabel: '界面',
        kindTooltip: '插件在 DeepSeek Harness Web 界面中增加的可见入口或视图。',
        value: '工作区侧栏行菜单（⋯）',
        valueHint: 'OpenInVscodeRow · sidebar.workspaces.row-menu',
      },
      {
        kind: 'tool',
        kindLabel: '模型工具',
        kindTooltip: '加载此插件后，模型在会话中可以调用的工具。',
        value: 'bash',
        valueHint: 'Run a shell command.',
      },
    ]);
  });
});
