export const registryTopicIds = [
  'ui-client',
  'model-tools',
  'models',
  'storage',
  'workflow',
  'sessions',
  'runtime',
  'other',
] as const;

export type RegistryTopicId = (typeof registryTopicIds)[number];

export interface RegistryTopic {
  id: RegistryTopicId;
  label: { en: string; zh: string };
  description: { en: string; zh: string };
  selectionAdvice: { en: string; zh: string };
  sourceCategories: readonly string[];
}

export const registryTopics: readonly RegistryTopic[] = [
  {
    id: 'ui-client',
    label: { en: 'UI & client plugins', zh: 'UI 与客户端插件' },
    description: {
      en: 'DeepSeek Harness plugins that extend browser surfaces, input interactions, settings, feedback, and other client-facing experiences.',
      zh: '扩展 DeepSeek Harness 浏览器界面、输入交互、设置、反馈与其他客户端体验的插件。',
    },
    selectionAdvice: {
      en: 'Check the declared client entry, UI slots, and target profile before enabling a UI extension.',
      zh: '启用 UI 扩展前，应核对它声明的客户端入口、UI 插槽与目标 Profile。',
    },
    sourceCategories: ['client-ui', 'interaction', 'feedback', 'settings', 'attachment'],
  },
  {
    id: 'model-tools',
    label: { en: 'Model tools & skills', zh: '模型工具与技能' },
    description: {
      en: 'DSH plugins that expose callable tools, skills, language services, and MCP-backed capabilities to the model.',
      zh: '向模型暴露可调用工具、技能、语言服务与 MCP 能力的 DSH 插件。',
    },
    selectionAdvice: {
      en: 'Review tool names, write effects, required binaries, and permission boundaries before use.',
      zh: '使用前应检查工具名称、写入影响、外部依赖与权限边界。',
    },
    sourceCategories: ['tools', 'lsp', 'mcp', 'skill'],
  },
  {
    id: 'models',
    label: { en: 'Models & providers', zh: '模型与提供方' },
    description: {
      en: 'DeepSeek Harness plugins for model providers, credential resolution, retries, selection, and token accounting.',
      zh: '用于模型提供方、凭据解析、重试、选择与 Token 统计的 DeepSeek Harness 插件。',
    },
    selectionAdvice: {
      en: 'Confirm credential handling, model identifiers, retry behavior, and provider-specific limits.',
      zh: '重点核对凭据处理、模型标识、重试行为与提供方限制。',
    },
    sourceCategories: ['models', 'credentials'],
  },
  {
    id: 'storage',
    label: { en: 'Storage & persistence', zh: '存储与持久化' },
    description: {
      en: 'DSH plugins that persist structured data, spill large values, or provide local and database-backed storage.',
      zh: '负责结构化数据持久化、大对象下沉，以及本地或数据库存储的 DSH 插件。',
    },
    selectionAdvice: {
      en: 'Compare data location, schema ownership, retention, migration, and deletion behavior.',
      zh: '选择时应比较数据位置、Schema 所有权、保留周期、迁移与删除行为。',
    },
    sourceCategories: ['storage', 'spill'],
  },
  {
    id: 'workflow',
    label: { en: 'Workflow & orchestration', zh: '工作流与编排' },
    description: {
      en: 'DeepSeek Harness plugins for goals, plans, schedules, hooks, guards, and multi-step agent orchestration.',
      zh: '提供目标、计划、调度、Hooks、Guard 与多步骤 Agent 编排能力的 DeepSeek Harness 插件。',
    },
    selectionAdvice: {
      en: 'Inspect trigger conditions, persistence, cancellation, failure recovery, and approval gates.',
      zh: '重点检查触发条件、持久化、取消、失败恢复与审批门禁。',
    },
    sourceCategories: ['orchestration', 'goal', 'plan', 'schedule', 'hooks', 'guard'],
  },
  {
    id: 'sessions',
    label: { en: 'Sessions & context', zh: '会话与上下文' },
    description: {
      en: 'DSH plugins for session state, context injection, compaction, projections, checkpoints, and conversation history.',
      zh: '管理会话状态、上下文注入、压缩、投影、检查点与对话历史的 DSH 插件。',
    },
    selectionAdvice: {
      en: 'Verify what enters the model context, what persists across restarts, and how state can be inspected or removed.',
      zh: '需要核对哪些内容进入模型上下文、哪些状态跨重启保留，以及如何检查或删除。',
    },
    sourceCategories: ['sessions', 'context', 'compaction'],
  },
  {
    id: 'runtime',
    label: { en: 'Runtime & platform', zh: '运行时与平台' },
    description: {
      en: 'The host, web, sandbox, SDK, workspace, and platform modules that make the DeepSeek Harness runtime work.',
      zh: '支撑 DeepSeek Harness 运行的 Host、Web、沙箱、SDK、Workspace 与平台模块。',
    },
    selectionAdvice: {
      en: 'Treat these as infrastructure: check host injection, platform constraints, process boundaries, and profile composition.',
      zh: '这类插件属于基础设施，应检查 Host 注入、平台限制、进程边界与 Profile 组合方式。',
    },
    sourceCategories: [
      'runtime',
      'platform',
      'core',
      'web',
      'e2b',
      'acp',
      'runtime-diagnostics',
      'sdk',
      'typert',
      'workspace',
      'test-support',
      'examples',
    ],
  },
  {
    id: 'other',
    label: { en: 'Bundles & other modules', zh: '组合包与其他模块' },
    description: {
      en: 'Profile layers, presets, and catalog records that do not belong to a narrower capability topic.',
      zh: 'Profile 层、Preset，以及不属于其他单一能力主题的目录条目。',
    },
    selectionAdvice: {
      en: 'Distinguish a built-in profile layer from a standalone Git-installable community bundle.',
      zh: '需要区分内置 Profile 层与可从 Git 独立安装的社区组合包。',
    },
    sourceCategories: ['bundles', 'preset'],
  },
] as const;

const topicByCategory = new Map(
  registryTopics.flatMap((topic) =>
    topic.sourceCategories.map((category) => [category, topic.id] as const),
  ),
);

export function topicIdForCategory(category: string): RegistryTopicId | undefined {
  return topicByCategory.get(category);
}

export function topicForCategory(category: string): RegistryTopic {
  const topicId = topicIdForCategory(category);
  const topic = registryTopics.find((candidate) => candidate.id === topicId);
  if (!topic) throw new Error(`No registry topic for category: ${category}`);
  return topic;
}
