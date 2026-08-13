(function attachProductScreenModel(globalScope) {
  const runtime = globalScope.OneePrototypeRuntime;
  if (!runtime) throw new Error('OneePrototypeRuntime must load before mobile-screen-model.js');

  function action(label, target) {
    return Object.freeze(target ? { label, target } : { label });
  }

  function screen(fields, actions = {}) {
    return Object.freeze({
      fields: Object.freeze(fields),
      actions: Object.freeze(actions),
    });
  }

  const primaryTask = '检查核心流程';

  globalScope.OneeProductScreenModel = runtime.defineScreenModel({
    entryScreenId: 'home',
    screens: {
      welcome: screen(
        {
          caption: '首次进入',
          brandMark: 'N',
          brandName: 'Northstar',
          title: '把重要工作带到清晰的下一步。',
          body: '一次只关注一个目标，持续看到自己向前。',
        },
        {
          startSetup: action('开始设置', 'goal'),
          existingGoal: action('我已有目标', 'home'),
        },
      ),
      goal: screen(
        {
          caption: '创建目标',
          step: '1 / 2',
          overline: 'Current goal',
          title: '你现在最想推进什么？',
          goalLabel: '目标',
          goalValue: '完成首轮用户验证',
          periodLabel: '计划周期',
          periodShort: '7 天',
          periodSelected: '14 天',
          periodLong: '30 天',
        },
        {
          cancel: action('取消', 'welcome'),
          continue: action('继续', 'home'),
        },
      ),
      home: screen(
        {
          caption: '今日首页',
          dateLabel: 'Tuesday / 22 Jul',
          title: '今天的焦点',
          avatarLabel: 'ON',
          focusLabel: '当前目标',
          focusGoal: '完成首轮用户验证',
          progress: '68%',
          progressMessage: '当前目标已推进到可验证阶段。',
          progressMeta: '68% · 还剩 4 天',
          nextLabel: '下一步',
          primaryTask,
          primaryTaskMeta: '预计 20 分钟',
          secondaryTask: '记录用户反馈',
          secondaryTaskMeta: '3 条待整理',
          tertiaryTask: '确认下一里程碑',
          tabToday: '今天',
          tabProgress: '进展',
          tabProfile: '我的',
        },
        {
          primary: action(primaryTask, 'task'),
        },
      ),
      task: screen(
        {
          caption: '任务详情',
          overflowLabel: '•••',
          overline: 'Next action',
          title: primaryTask,
          body: '从新用户视角走完创建目标到完成第一个动作的流程。',
          durationLabel: '预计用时',
          durationValue: '20 min',
          checklistReady: '准备测试账号',
          checklistJourney: '完成关键路径',
          checklistBlocker: '记录阻塞位置',
        },
        {
          back: action('‹ 今天', 'home'),
          complete: action('标记完成', 'complete'),
        },
      ),
      complete: screen(
        {
          caption: '完成反馈',
          overline: 'Action complete',
          title: '关键动作已完成。',
          body: '目标进展从 68% 更新到 76%。',
          resultLabel: '本次推进',
          resultValue: '+8%',
          streakLabel: '连续推进 4 天',
        },
        {
          review: action('记录这次收获', 'review'),
          later: action('稍后复盘', 'home'),
        },
      ),
      review: screen(
        {
          caption: '阶段复盘',
          closeLabel: '关闭',
          navTitle: '复盘',
          overline: 'Review / Week 02',
          title: '这轮目标带来了什么？',
          completedValue: '8',
          completedLabel: '完成动作',
          streakValue: '4',
          streakLabel: '连续天数',
          progressValue: '76%',
          progressLabel: '当前进展',
          noteLabel: '最重要的发现',
          noteValue: '用户能理解目标，但第一次创建下一步时需要更清楚的示例。',
        },
        {
          next: action('选择下一里程碑', 'next'),
        },
      ),
      next: screen(
        {
          caption: '下一里程碑',
          backLabel: '‹ 复盘',
          navTitle: '下一步',
          overline: 'Next milestone',
          title: '把发现变成下一轮行动。',
          firstMilestone: '优化首次创建体验',
          firstMilestoneMeta: '基于本轮用户反馈',
          secondMilestone: '扩大用户验证范围',
          secondMilestoneMeta: '再邀请 5 位用户',
          customMilestone: '自定义里程碑',
          customMilestoneMeta: '输入自己的下一步',
        },
        {
          start: action('开始下一轮', 'home'),
        },
      ),
    },
  });
})(globalThis);
