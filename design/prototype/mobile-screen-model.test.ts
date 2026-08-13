import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import './runtime/prototype-runtime.js';
import './mobile-screen-model.js';

type PrototypeAction = {
  label: string;
  target?: string;
};

type PrototypeScreen = {
  fields: Readonly<Record<string, string>>;
  actions: Readonly<Record<string, PrototypeAction>>;
};

type PrototypeModel = {
  entryScreenId: string;
  getScreen(screenId: string): PrototypeScreen;
  screenIds: ReadonlyArray<string>;
};

type PrototypeGlobals = {
  OneePrototypeRuntime: {
    defineScreenModel(definition: {
      entryScreenId: string;
      screens: Record<string, PrototypeScreen>;
    }): PrototypeModel;
  };
  OneeProductScreenModel: PrototypeModel;
};

const prototypeGlobals = globalThis as unknown as PrototypeGlobals;
const prototypeRuntime = prototypeGlobals.OneePrototypeRuntime;
const screenModel = prototypeGlobals.OneeProductScreenModel;
const prototypeDirectory = fileURLToPath(new URL('.', import.meta.url));

function readPrototypeFile(fileName: string) {
  return readFileSync(`${prototypeDirectory}${fileName}`, 'utf8');
}

describe('mobile prototype screen-model seam', () => {
  it('provides one canonical home screen for both prototype adapters', () => {
    expect(screenModel.entryScreenId).toBe('home');
    expect(screenModel.getScreen('home')).toMatchObject({
      fields: {
        title: '今天的焦点',
        progress: '68%',
        primaryTask: '检查核心流程',
      },
      actions: {
        primary: {
          label: '检查核心流程',
          target: 'task',
        },
      },
    });
  });

  it('defines only transitions that point to real screens', () => {
    const targets = screenModel.screenIds.flatMap((screenId) =>
      Object.values(screenModel.getScreen(screenId).actions)
        .map((action) => action.target)
        .filter((target): target is string => Boolean(target)),
    );

    expect(targets.filter((target) => !screenModel.screenIds.includes(target))).toEqual([]);
  });

  it('covers every concrete screen in the template mobile flow', () => {
    expect(screenModel.screenIds).toEqual([
      'welcome',
      'goal',
      'home',
      'task',
      'complete',
      'review',
      'next',
    ]);
  });

  it('rejects a screen model with a dangling action target', () => {
    expect(() =>
      prototypeRuntime.defineScreenModel({
        entryScreenId: 'home',
        screens: {
          home: {
            fields: {},
            actions: {
              primary: {
                label: '继续',
                target: 'missing',
              },
            },
          },
        },
      }),
    ).toThrow('Unknown prototype action target: missing');
  });

  it('rejects a screen model whose entry screen is missing', () => {
    expect(() =>
      prototypeRuntime.defineScreenModel({
        entryScreenId: 'missing',
        screens: {
          home: {
            fields: {},
            actions: {},
          },
        },
      }),
    ).toThrow('Unknown prototype entry screen: missing');
  });

  it('copies and deeply freezes normalized screen content', () => {
    const fields = { title: '原始标题' };
    const primaryAction = { label: '继续', target: 'detail' };
    const screens = {
      home: {
        fields,
        actions: { primary: primaryAction },
      },
      detail: {
        fields: { title: '详情' },
        actions: {},
      },
    };
    const model = prototypeRuntime.defineScreenModel({
      entryScreenId: 'home',
      screens,
    });

    fields.title = '外部修改';
    primaryAction.label = '外部修改';

    const home = model.getScreen('home');
    const primary = home.actions.primary;
    expect(primary).toBeDefined();
    if (!primary) throw new Error('Expected home.actions.primary');

    expect(home.fields.title).toBe('原始标题');
    expect(primary.label).toBe('继续');
    expect(Object.isFrozen(home)).toBe(true);
    expect(Object.isFrozen(home.fields)).toBe(true);
    expect(Object.isFrozen(home.actions)).toBe(true);
    expect(Object.isFrozen(primary)).toBe(true);
  });

  it('keeps both pages wired to the model instead of duplicating canonical copy', () => {
    const mobilePage = readPrototypeFile('mobile.html');
    const flowPage = readPrototypeFile('mobile-flow.html');
    const mobileAdapter = readPrototypeFile('mobile.js');
    const flowAdapter = readPrototypeFile('mobile-flow.js');
    const artifactSources = [mobilePage, flowPage, mobileAdapter, flowAdapter];

    expect(mobilePage.indexOf('runtime/prototype-runtime.js')).toBeLessThan(
      mobilePage.indexOf('mobile-screen-model.js'),
    );
    expect(mobilePage.indexOf('mobile-screen-model.js')).toBeLessThan(
      mobilePage.indexOf('mobile.js'),
    );
    expect(flowPage.indexOf('runtime/prototype-runtime.js')).toBeLessThan(
      flowPage.indexOf('mobile-screen-model.js'),
    );
    expect(flowPage.indexOf('mobile-screen-model.js')).toBeLessThan(
      flowPage.indexOf('mobile-flow.js'),
    );

    expect(mobilePage).toContain('data-model-screen="home"');
    for (const screenId of screenModel.screenIds) {
      expect(flowPage).toContain(`data-model-screen="${screenId}"`);
    }

    const canonicalValues = screenModel.screenIds.flatMap((screenId) => {
      const screen = screenModel.getScreen(screenId);
      return [
        ...Object.values(screen.fields),
        ...Object.values(screen.actions).map((action) => action.label),
      ].filter((value) => value.length >= 5);
    });

    for (const source of artifactSources) {
      for (const value of canonicalValues) {
        expect(source, value).not.toContain(value);
      }
    }

    expect(mobilePage).not.toMatch(/data-model-(?:field|action-label)="[^"]+"[^>]*>\s*[^<\s]/);
    expect(flowPage).not.toMatch(/data-model-(?:field|action-label)="[^"]+"[^>]*>\s*[^<\s]/);
    expect(mobileAdapter).toContain('hydrateModel');
    expect(flowAdapter).toContain('hydrateModel');
    expect(flowAdapter).toContain('OneeFlowCanvas.mount');
  });

  it('uses only fields and actions defined by each bound screen in both pages', () => {
    const mobilePage = readPrototypeFile('mobile.html');
    const flowPage = readPrototypeFile('mobile-flow.html');
    const screenBlocks = [
      ...flowPage.matchAll(
        /<article\b(?=[^>]*data-model-screen="([^"]+)")[^>]*>([\s\S]*?)<\/article>/g,
      ),
    ];
    const missingBindings: string[] = [];

    checkBindings('home', mobilePage);
    for (const match of screenBlocks) {
      const screenId = match[1];
      const body = match[2];
      if (!screenId || !body) throw new Error('Expected a complete model-bound screen block');
      checkBindings(screenId, body);
    }

    function checkBindings(screenId: string, source: string) {
      const screen = screenModel.getScreen(screenId);
      for (const match of source.matchAll(/data-model-field="([^"]+)"/g)) {
        const fieldName = match[1];
        if (!fieldName) throw new Error('Expected a model field name');
        if (!Object.hasOwn(screen.fields, fieldName)) {
          missingBindings.push(`${screenId}.field.${fieldName}`);
        }
      }
      for (const match of source.matchAll(/data-model-action(?:-label)?="([^"]+)"/g)) {
        const actionName = match[1];
        if (!actionName) throw new Error('Expected a model action name');
        if (!Object.hasOwn(screen.actions, actionName)) {
          missingBindings.push(`${screenId}.action.${actionName}`);
        }
      }
    }

    expect(screenBlocks.map(([, screenId]) => screenId)).toEqual(screenModel.screenIds);
    expect(missingBindings).toEqual([]);
  });

  it('keeps the auto-synced canvas shell free of product color literals', () => {
    const runtimeCss = readPrototypeFile('runtime/flow-canvas.css');

    expect(runtimeCss).not.toMatch(/#[\da-f]{3,8}\b/i);
    expect(runtimeCss).not.toContain('rgb(');
  });

  it('marks only template-owned runtime files for automatic downstream sync', () => {
    const syncManifest = readPrototypeFile('../../.sync-manifest');

    expect(syncManifest).toContain('auto design/prototype/runtime/prototype-runtime.js');
    expect(syncManifest).toContain('auto design/prototype/runtime/flow-canvas.js');
    expect(syncManifest).toContain('auto design/prototype/runtime/flow-canvas.css');
    expect(syncManifest).toContain('auto design/prototype/runtime/README.md');
    expect(syncManifest).not.toContain('auto design/prototype/mobile-screen-model.js');
    expect(syncManifest).not.toContain('auto design/prototype/mobile.html');
    expect(syncManifest).not.toContain('auto design/prototype/mobile-flow.html');
  });
});
