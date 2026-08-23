import type { CatalogEntry } from './catalog-types.js';
import type { Locale } from './i18n.js';

export const useCaseIds = [
  'ui-surface',
  'agent-tools',
  'dev-code',
  'vision-media',
  'memory-context',
  'model-prompt',
  'automation',
  'usage-cost',
  'session-history',
  'data-storage',
  'browser-web',
  'integrations',
  'runtime-core',
  'other',
] as const;

export type UseCaseId = (typeof useCaseIds)[number];

const labels: Record<UseCaseId, { en: string; zh: string }> = {
  'ui-surface': { en: 'Interface & interaction', zh: '界面与交互' },
  'agent-tools': { en: 'Model tools', zh: '模型工具' },
  'dev-code': { en: 'Code & developer tools', zh: '开发与代码' },
  'vision-media': { en: 'Vision & media', zh: '视觉与多媒体' },
  'memory-context': { en: 'Memory & context', zh: '记忆与上下文' },
  'model-prompt': { en: 'Models & prompts', zh: '模型与提示词' },
  automation: { en: 'Workflow & automation', zh: '工作流与自动化' },
  'usage-cost': { en: 'Usage & cost', zh: '用量与成本' },
  'session-history': { en: 'Sessions & history', zh: '会话与历史' },
  'data-storage': { en: 'Data & storage', zh: '数据与存储' },
  'browser-web': { en: 'Browsing & search', zh: '浏览与搜索' },
  integrations: { en: 'External integrations', zh: '外部集成' },
  'runtime-core': { en: 'Runtime & extension', zh: '运行时与扩展' },
  other: { en: 'General & other', zh: '通用与其他' },
};

// Package names carry more reliable structure than description prose, because the
// Harness monorepo and the community both follow `dsh-<area>-<detail>`. Names are
// matched as whole tokens against a normalized string so that `bot` cannot match
// `bottom` and `store` cannot match a name that only happens to contain it.
// Order is priority: compound phrases must precede the generic token they contain.
const namePatterns: Array<[UseCaseId, RegExp]> = [
  ['runtime-core', /\bplugin (store|audit|browser|inventory|template|manager|list)\b/],
  ['ui-surface', /\bat file\b|\bstatus label\b|\bbottom bar\b/],
  ['usage-cost', /\bbottom stats\b/],
  [
    'vision-media',
    /\b(vision|image|img|ocr|screenshot|media|video|audio|voice|tts|whisper|speech|vlm|draw|paint|figure)\b/,
  ],
  [
    'ui-surface',
    /\b(ui|theme|skin|sidebar|statusbar|notification|notify|toast|pet|cat|game|minigames|latex|markdown|composer|layout|icon|sound|soundscape|animation|render|badge|panel|highlight)\b/,
  ],
  ['agent-tools', /\b(tool|tools|mcp|toolkit|skill|skills)\b/],
  [
    'memory-context',
    /\b(memory|context|compact|compaction|rag|knowledge|embedding|recall|notes)\b/,
  ],
  ['browser-web', /\b(browser|crawl|crawler|scrape|spider|tavily|serp|rss|news|websearch)\b/],
  [
    'dev-code',
    /\b(git|github|gitlab|vscode|editor|ide|lint|debug|docker|deploy|shell|terminal|tui|cli|code|codex|patch|diff|wsl|ssh|lsp|repo|build|test)\b/,
  ],
  [
    'automation',
    /\b(workflow|orchestration|orchestrator|automation|schedule|scheduler|cron|hook|hooks|pipeline|subagent|agent|gate|verify|proof|todo|task|plan|goal|regression|benchmark)\b/,
  ],
  [
    'integrations',
    /\b(wechat|weixin|feishu|lark|dingtalk|telegram|discord|slack|notion|jira|mail|email|calendar|webhook|bark|sms|bot|chatnode)\b/,
  ],
  [
    'usage-cost',
    /\b(telemetry|metrics|usage|cost|wallet|billing|budget|token|tokens|quota|ratelimiter|monitor|dashboard|stats|audit|log|logs|insights)\b/,
  ],
  [
    'session-history',
    /\b(session|sessions|conversation|history|rewind|checkpoint|turn|chat|message|messages|fork|pins)\b/,
  ],
  [
    'model-prompt',
    /\b(prompt|persona|llm|model|models|provider|reasoning|credential|credentials|oauth|router|autorouter|selector)\b/,
  ],
  [
    'data-storage',
    /\b(storage|store|database|sqlite|postgres|redis|backup|export|import|sync|attachment|spill|file|files|fs|share|repro|projects)\b/,
  ],
  [
    'runtime-core',
    /\b(runtime|loader|cordis|seam|gateway|host|permission|permissions|approval|retry|sandbox|subprocess|process|bundle|profile|base|api|rpc|sdk|typert|module|modules|connection|hmr|locale|command|commands|workspace|capsule|e2b)\b/,
  ],
];

// Description patterns only run when the name is inconclusive. An entry must hit at
// least one decisive (weight 3) term to be classified, so a vague description lands in
// `other` rather than collecting weak hints into a confidently wrong label.
const descriptionRules: Array<[UseCaseId, Array<[number, RegExp]>]> = [
  [
    'vision-media',
    [
      [
        3,
        /视觉|多模态|识图|看图|图像识别|\bocr\b|vision|截图|screenshot|配音|语音合成|文字转语音|语音识别|\btts\b|whisper|字幕|subtitle|文生图|图生图|绘图|画图|分镜|generate ?(and \w+ )?(images?|videos?)|生成图片|生成视频|\bmatting\b|抠图|frame ?interpolation|补帧|\blottie\b|动画|\banimation|语音播报|voice ?announcement/i,
      ],
      [1, /图片|图像|\bimage\b|视频|\bvideo\b|音乐|音频|语音|摄像/i],
    ],
  ],
  [
    'memory-context',
    [
      [
        3,
        /长期记忆|记忆库|记忆体|记忆系统|\bmemory\b|向量|embedding|\brag\b|知识库|knowledge ?base|上下文压缩|context ?compact|语义检索|handoff|交接/i,
      ],
      [1, /记忆|上下文|压缩|回忆|笔记|摘要/i],
    ],
  ],
  [
    'browser-web',
    [
      [
        3,
        /浏览器自动化|爬虫|爬取|抓取|scrape|crawl|puppeteer|playwright|selenium|网页解析|联网搜索|web ?search|搜索引擎|search ?engine|tavily|书签|fetch ?(any )?webpage|url ?reader|读取网页|\barxiv\b|literature|文献|论文/i,
      ],
      [1, /网页|\brss\b|新闻|站点/i],
    ],
  ],
  [
    'agent-tools',
    [
      [
        3,
        /注册.{0,4}工具|工具注册|模型工具|可调用工具|\bmcp\b|model ?context ?protocol|tool ?schema|暴露给模型|tools\/execute|工具调用|openapi|api ?calling|\badb\b|技能发现|skill ?(discovery|manage)|tool ?(box|kit|bundle|suite|plugin)|工具箱|工具包|as agent tools|agent ?tools?\b|skill ?bundle|技能包/i,
      ],
      [1, /\btool\b|工具|技能|\bskill\b/i],
    ],
  ],
  [
    'dev-code',
    [
      [
        3,
        /\bgit\b|github|gitlab|pull ?request|代码审查|code ?review|重构|refactor|vscode|编辑器|\bide\b|\blint\b|单元测试|unit ?test|调试|debug|docker|kubernetes|部署|deploy|ci\/cd|\bwsl\b|代码补全|终端|terminal|\bshell\b|命令行/i,
      ],
      [1, /代码|\bcode\b|测试|仓库|脚手架/i],
    ],
  ],
  [
    'automation',
    [
      [
        3,
        /工作流|workflow|编排|orchestrat|多智能体|multi-?agent|子代理|subagent|任务队列|pipeline|定时任务|\bcron\b|自动化|automation|门禁|验收|自检|self-?check|批量处理|超时|timeout|benchmark|评测|回归测试|regression|self-?evol|自我进化|方法论|methodology|evidence-?first|证据优先|fail-?closed|\bgates?\b|交付前/i,
      ],
      [1, /调度|钩子|hook|流程|并行|任务/i],
    ],
  ],
  [
    'integrations',
    [
      [
        3,
        /微信|飞书|钉钉|企业微信|telegram|discord|slack|whatsapp|notion|jira|trello|邮件|邮箱|smtp|imap|日历|calendar|webhook|推送通知|server ?酱|\bbark\b|短信|机器人/i,
      ],
      [1, /第三方|集成|integrat/i],
    ],
  ],
  [
    'usage-cost',
    [
      [
        3,
        /token ?统计|用量统计|成本|花费|\bcost\b|计费|billing|额度|quota|仪表盘|dashboard|监控|monitor|遥测|telemetry|埋点|限速|rate ?limit|余额|balance/i,
      ],
      [1, /统计|指标|用量|审计|报表/i],
    ],
  ],
  [
    'ui-surface',
    [
      [
        3,
        /主题|\btheme\b|皮肤|换肤|\bskin\b|界面美化|状态栏|status ?bar|侧栏|sidebar|小游戏|游戏|\bgame\b|音效|提示音|快捷键|shortcut|布局|layout|深色模式|dark ?mode|桌面宠物|桌宠|live2d|latex|公式|输入框|composer|悬浮|拖拽|面板|panel|菜单|弹窗|通知|提醒|渲染为|\brenders?\b|mermaid|幻灯片|presentation|\bslides?\b|抽屉|\bdrawer\b|雷达图|图表|\bchart\b|摸鱼|番茄钟|jumpscare|display ?mode|展示模式|web ?(ui|gui)|webui|settings ?page|设置页|\boverlay\b|指示器|indicator|progress ?bar|进度条|wallpaper|壁纸|折叠|collapse|表情|sticker|system-?tray|托盘|护眼|\bviewer\b|companion|表情包/i,
      ],
      [1, /界面|样式|\bcss\b|可视化|渲染|按钮|复制/i],
    ],
  ],
  [
    'model-prompt',
    [
      [
        3,
        /提示词|\bprompt\b|系统提示|persona|人格|角色卡|思维链|推理模式|reasoning|模型路由|model ?rout|多模型|模型切换|微调|凭据|credential|登录态|\boauth\b|control ?plane|控制平面|\bprovider\b|模型选择|model ?(picker|selector|control)/i,
      ],
      [1, /模型|\bllm\b|温度|采样/i],
    ],
  ],
  [
    'data-storage',
    [
      [
        3,
        /数据库|database|sqlite|postgres|mysql|redis|向量库|备份|backup|导出|export|导入|import|迁移|migrat|同步|归档/i,
      ],
      [1, /存储|持久化|附件/i],
    ],
  ],
  [
    'session-history',
    [
      [
        3,
        /会话管理|会话日志|对话历史|会话分支|多轮对话|回溯|rewind|检查点|checkpoint|时间线|timeline/i,
      ],
      [1, /会话|对话|消息|轮次|历史/i],
    ],
  ],
  [
    'runtime-core',
    [
      [
        3,
        /\bseam\b|cordis|\bloader\b|权限|permission|审批|approval|重试|retry|中间件|middleware|宿主|子进程|subprocess|沙箱|sandbox|生命周期|lifecycle|插件商店|插件管理|插件列表|插件设置|插件市场|依赖注入|组合包|profile ?层|工作区注册表|plugin ?(store|marketplace|registry|manager|management|settings|catalog|hub|list)|plugin ?(enable|disable|install|finder|discovery|recommend|library|guide)|一键安装|one-?click install|install(ation)? ?(hygiene|checklist)|package contract|\bprofiles?\b|config ?(drift|watch)|配置漂移|端口|port ?conflict|扩展中心|插件推荐|插件发现|值得装|extension hub|hot-?toggle|restart|重启|boot-?time|启动器|launcher|远程访问|remote access|\blan\b|tunnel|内网/i,
      ],
      [1, /运行时|插件系统|内置模块|适配器|协议/i],
    ],
  ],
];

// `@dsh-external/dsh-open-in-vscode` -> `dsh external dsh open in vscode`
function nameTokens(entry: CatalogEntry): string {
  return `${entry.name} ${entry.slug}`
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameUseCase(entry: CatalogEntry): UseCaseId | undefined {
  const tokens = nameTokens(entry);
  for (const [id, pattern] of namePatterns) if (pattern.test(tokens)) return id;
  return undefined;
}

function descriptionUseCase(entry: CatalogEntry): UseCaseId | undefined {
  const text = `${entry.description.zh} ${entry.description.en}`;
  let winner: UseCaseId | undefined;
  let best = 0;
  for (const [id, patterns] of descriptionRules) {
    let score = 0;
    for (const [weight, pattern] of patterns) if (pattern.test(text)) score += weight;
    // Require a decisive hit, not an accumulation of weak hints.
    if (score >= 3 && score > best) {
      best = score;
      winner = id;
    }
  }
  return winner;
}

export function useCaseFor(entry: CatalogEntry): UseCaseId {
  return nameUseCase(entry) ?? descriptionUseCase(entry) ?? 'other';
}

export function useCaseLabel(id: UseCaseId, locale: Locale): string {
  return labels[id][locale];
}

export function useCaseCounts(
  entries: readonly CatalogEntry[],
): Array<{ id: UseCaseId; count: number }> {
  const counts = new Map<UseCaseId, number>();
  for (const entry of entries) {
    const id = useCaseFor(entry);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return useCaseIds
    .map((id) => ({ id, count: counts.get(id) ?? 0 }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count);
}
