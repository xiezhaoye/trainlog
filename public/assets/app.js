/* 锻炼模块 — 共享数据层与交互工具 */
(function () {
  'use strict';

  var API_BASE = window.TRAINING_API_BASE || '';
  var TOKEN = window.TRAINING_TOKEN || '';

  function apiGet(path) {
    return fetch(API_BASE + path).then(function (r) { return r.json(); });
  }
  function apiSend(method, path, body) {
    return fetch(API_BASE + path, {
      method: method,
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + TOKEN },
      body: body != null ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json(); });
  }

  var templatesCache = [];
  var recordsCache = [];
  var weeklyPlanVersionsCache = []; // 按 effectiveFrom 升序排列的 {effectiveFrom, plan} 列表
  var actionLibraryCache = [];
  // 部位/动作数据现在由后端 action-library 管理（可在"动作库"页增删改），
  // ACTIONS_BY_PART/BODY_PARTS 保持原有的直接属性形态（不是函数）以兼容
  // template-edit.html/execute-resistance.html 里已有的 W.BODY_PARTS.map(...)
  // 用法——因此这里用原地修改（clear+填充）而不是重新赋值，这样 window.Workout
  // 导出时捕获的引用在 ready resolve 后仍然指向同一个对象/数组。
  var ACTIONS_BY_PART = {};
  var BODY_PARTS = [];
  var CARDIO_ACTIONS = ['跑步机慢跑', '室外慢跑'];

  function rebuildActionLibraryIndex() {
    BODY_PARTS.length = 0;
    Object.keys(ACTIONS_BY_PART).forEach(function (k) { delete ACTIONS_BY_PART[k]; });
    actionLibraryCache.forEach(function (p) {
      BODY_PARTS.push(p.name);
      ACTIONS_BY_PART[p.name] = p.actions.slice();
    });
  }

  var ready = Promise.all([
    apiGet('/api/templates'),
    apiGet('/api/records'),
    apiGet('/api/weekly-plan/versions'),
    apiGet('/api/action-library'),
  ]).then(function (results) {
    templatesCache = (results[0] && results[0].templates) || [];
    recordsCache = (results[1] && results[1].records) || [];
    weeklyPlanVersionsCache = (results[2] && results[2].versions) || [];
    actionLibraryCache = (results[3] && results[3].parts) || [];
    rebuildActionLibraryIndex();
  });

  var ICONS = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.2h3.4l.5 2.3a7 7 0 0 1 1.9 1.1l2.2-.8 1.7 3-1.8 1.5a7.3 7.3 0 0 1 0 2.2l1.8 1.5-1.7 3-2.2-.8a7 7 0 0 1-1.9 1.1l-.5 2.3h-3.4l-.5-2.3a7 7 0 0 1-1.9-1.1l-2.2.8-1.7-3 1.8-1.5a7.3 7.3 0 0 1 0-2.2L4 8.8l1.7-3 2.2.8a7 7 0 0 1 1.9-1.1z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="5" r="1.6"/><path d="M9 20l2.2-4 2.8 1.5L17 20M7 14l3-2.6 2 1.6 3-4.4M4 20l3-4"/></svg>',
    dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3-2 4-2 7a3 3 0 0 0 6 0c1.5 1 2 3 2 4.5A5.5 5.5 0 0 1 6.5 14C6.5 9 12 7 12 3z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    calendarPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M4 10h16M8 3.5v3M16 3.5v3M12 13v5M9.5 15.5h5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M4 10h16M8 3.5v3M16 3.5v3"/></svg>',
    calendarCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M4 10h16M8 3.5v3M16 3.5v3M9 14.5l2 2 4-4"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  };

  function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromDateStr(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function todayStr() { return toDateStr(new Date()); }
  function isSameDate(a, b) { return toDateStr(a) === toDateStr(b); }
  // 当前查看的训练日期：只在内存/标签页里传递，不落 URL（切日期不改 URL、
  // URL 里也不带日期）。首页每次渲染写入，执行页返回/打开时读取。
  var NAV_DATE_KEY = 'training.navDate';
  function setNavDate(dateStr) { try { sessionStorage.setItem(NAV_DATE_KEY, dateStr); } catch (e) {} }
  function getNavDate() { try { return sessionStorage.getItem(NAV_DATE_KEY) || ''; } catch (e) { return ''; } }
  var WEEKDAYS_SHORT = ['一', '二', '三', '四', '五', '六', '日'];
  var WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  function weekdayIndexMonFirst(d) { return (d.getDay() + 6) % 7; }
  function weekdayKeyForDate(d) { return WEEKDAY_KEYS[weekdayIndexMonFirst(d)]; }
  function startOfWeek(d) { return addDays(d, -weekdayIndexMonFirst(d)); }
  function formatMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function formatMDWeekday(d) { return formatMD(d) + ' 周' + WEEKDAYS_SHORT[weekdayIndexMonFirst(d)]; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setWeightLabel(s) {
    if (s.is_bodyweight) return '自重';
    if (s.weight_kg != null) return s.weight_kg + 'kg';
    return '未填写';
  }

  // 训练时长选择器（执行训练页，日期右边那个，默认1小时/每次±30分钟）的文案格式化。
  function formatSessionDuration(minutes) {
    var h = minutes / 60;
    return (h % 1 === 0 ? h : h.toFixed(1)) + ' 小时';
  }

  // 一个点代表当天一条已完成的记录（按类型上色），不是"这个类型练没练过"的
  // 布尔值——同一天做了几次就显示几个点，跟计划里原本安排了几个无关。
  function dotHTMLForDate(dateStr, dotClassBase) {
    return getRecordsByDate(dateStr)
      .filter(function (r) { return r.completed; })
      .map(function (r) { return '<span class="' + dotClassBase + ' ' + dotClassBase + '--' + r.type + '"></span>'; })
      .join('');
  }

  function emptyPlan() {
    var plan = {};
    WEEKDAY_KEYS.forEach(function (k) { plan[k] = []; });
    return plan;
  }
  // 找出 dateStr 当天生效的那份计划版本（effectiveFrom <= dateStr 中最晚的一个）；
  // 改计划只会追加新版本、不改旧版本，所以过去的日期回看时用的还是当时生效的那份。
  function planForDateStr(dateStr) {
    var result = null;
    for (var i = 0; i < weeklyPlanVersionsCache.length; i++) {
      if (weeklyPlanVersionsCache[i].effectiveFrom <= dateStr) result = weeklyPlanVersionsCache[i].plan;
      else break;
    }
    return result || emptyPlan();
  }
  // ---- 执行训练的本地草稿 ----
  // 键格式：training:draft:resistance:<日期>:<rec|tpl|new>:<id>
  // 草稿只是"这次训练还没存盘的输入"，一旦训练存盘、或者计划/模板/动作库被改动
  // （草稿里的动作和组数可能就对不上了），立刻清掉，不留过期数据慢慢烂。
  var DRAFT_PREFIX = 'training:draft:';
  function forEachDraftKey(fn) {
    try {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf(DRAFT_PREFIX) === 0) fn(k); });
    } catch (e) { /* 隐私模式下没有 localStorage，忽略 */ }
  }
  function removeKey(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function clearTrainingDrafts() { forEachDraftKey(removeKey); }
  // 只保留 keepDates 里那几天的草稿（当天 + 正在补记的那天），其余立即丢弃。
  function dropOutdatedDrafts(keepDates) {
    var keep = keepDates || [];
    forEachDraftKey(function (k) {
      var date = k.split(':')[3];
      if (keep.indexOf(date) === -1) removeKey(k);
    });
  }

  function getWeeklyPlan() { return planForDateStr(todayStr()); }
  function saveWeeklyPlan(plan) {
    return apiSend('PUT', '/api/weekly-plan', { plan: plan }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'save weekly plan failed');
      weeklyPlanVersionsCache = res.versions || weeklyPlanVersionsCache;
      clearTrainingDrafts();
      return res.plan;
    });
  }
  function getActionLibrary() { return actionLibraryCache; }
  function saveActionLibrary(parts) {
    return apiSend('PUT', '/api/action-library', { parts: parts }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'save action library failed');
      actionLibraryCache = res.parts;
      rebuildActionLibraryIndex();
      clearTrainingDrafts();
      return actionLibraryCache;
    });
  }
  function getPlannedTemplatesForDate(d) {
    var plan = planForDateStr(toDateStr(d));
    var tids = plan[weekdayKeyForDate(d)] || [];
    return tids.map(getTemplate).filter(Boolean);
  }
  function isRestDay(d) { return getPlannedTemplatesForDate(d).length === 0; }

  // 找某天某个计划模板对应的"会话记录"：按动作逐条完成的抗阻训练，一个
  // 模板同一天只会有一场会话，动作的完成态（done）和用户录入的组数据都
  // 存在这条记录里。没有则返回 null（还没开始练）。
  function sessionRecordFor(dateStr, tid) {
    return recordsCache.find(function (r) { return r.templateId === tid && r.date === dateStr && r.type === 'resistance'; });
  }
  // 把当前动作的组数据 + 完成态写回/新建当天的会话记录。会话记录从模板
  // 全量初始化（模板里所有动作都带上，只是当前这个动作的 done/sets 被更新），
  // 这样首页按模板遍历每个动作时，done 状态都能对上。
  function saveSessionExercise(dateStr, tid, exIdx, exerciseData, done) {
    var tpl = getTemplate(tid);
    var rec = sessionRecordFor(dateStr, tid);
    var exercises;
    if (rec) {
      exercises = JSON.parse(JSON.stringify(rec.resistance.exercises));
    } else {
      exercises = JSON.parse(JSON.stringify((tpl && tpl.exercises) || []));
    }
    // 模板中途加了动作时补齐占位，避免下标越界
    while (exercises.length <= exIdx) {
      var tplEx = tpl && tpl.exercises[exercises.length];
      exercises.push(tplEx
        ? JSON.parse(JSON.stringify(tplEx))
        : { name: '动作' + (exercises.length + 1), part: '', done: false, sets: [] });
    }
    exercises[exIdx].sets = JSON.parse(JSON.stringify(exerciseData.sets || []));
    exercises[exIdx].done = !!done;
    // 训练模块迭代：动作体会 / 第一组打勾时间 / 完成时间 也写回会话记录。
    if (exerciseData.notes !== undefined) exercises[exIdx].notes = exerciseData.notes;
    if (exerciseData.first_set_ts !== undefined) exercises[exIdx].first_set_ts = exerciseData.first_set_ts;
    if (exerciseData.finish_ts !== undefined) exercises[exIdx].finish_ts = exerciseData.finish_ts;
    if (exerciseData.duration !== undefined) exercises[exIdx].duration = exerciseData.duration;
    if (exerciseData.type !== undefined) exercises[exIdx].type = exerciseData.type;
    var allDone = exercises.every(function (e) { return e.done; });
    return saveRecord({
      id: rec ? rec.id : uid('r'),
      date: dateStr, type: 'resistance',
      templateId: tid,
      templateName: (tpl && tpl.name) || (rec && rec.templateName) || '训练',
      resistance: { exercises: exercises },
      durationMinutes: (rec && rec.durationMinutes) || 60,
      completed: allDone,
      createdAt: rec ? rec.createdAt : Date.now(),
    });
  }

  function getTemplates() { return templatesCache; }
  function getTemplate(id) { return templatesCache.find(function (t) { return t.id === id; }); }

  // ── 训练模块迭代：当天「训练安排」动作级会话记录 ──
  // session=1 的记录（template_id 为空）是当天扁平的动作列表（抗阻/有氧混排），
  // 由「新增训练」浮层写入；整场完成态（completed）与感受（mood）也存这条记录上。
  function getDaySession(dateStr) {
    return recordsCache.find(function (r) { return r.session && r.date === dateStr; }) || null;
  }
  function saveDaySession(dateStr, actions, opts) {
    opts = opts || {};
    var existing = getDaySession(dateStr);
    var rec = {
      id: existing ? existing.id : uid('s'),
      date: dateStr,
      session: true,
      type: 'resistance',
      templateName: '今日训练',
      actions: actions,
      // 周计划动作不属于当天会话；删除它们需保存当天覆盖状态，避免首页按
      // 周计划重新生成时又把动作显示出来。
      hiddenTemplateActions: opts.hiddenTemplateActions !== undefined
        ? opts.hiddenTemplateActions
        : (existing && existing.hiddenTemplateActions) || [],
      completed: opts.completed !== undefined ? !!opts.completed : (existing ? !!existing.completed : false),
      mood: opts.mood !== undefined ? opts.mood : (existing ? existing.mood : null),
      createdAt: existing ? existing.createdAt : Date.now(),
    };
    return saveRecord(rec);
  }
  // 「新增训练」：把选中的动作加入当天的安排，均为未完成态。
  function addActionsToDay(dateStr, actionsToAdd) {
    var existing = getDaySession(dateStr);
    var actions = existing ? JSON.parse(JSON.stringify(existing.actions)) : [];
    actionsToAdd.forEach(function (a) { actions.push(a); });
    return saveDaySession(dateStr, actions, { completed: existing ? !!existing.completed : false });
  }
  // 单动作执行页的输入即自动保存：更新第 idx 个动作的部分字段。
  function updateDayAction(dateStr, idx, patch) {
    var existing = getDaySession(dateStr);
    if (!existing) return Promise.reject(new Error('no day session'));
    var actions = JSON.parse(JSON.stringify(existing.actions));
    if (!actions[idx]) return Promise.reject(new Error('action not found'));
    Object.keys(patch || {}).forEach(function (k) { actions[idx][k] = patch[k]; });
    return saveDaySession(dateStr, actions, { completed: !!existing.completed });
  }
  // 删除该动作：从当天的安排中移除，不动其它动作。
  function deleteDayAction(dateStr, idx) {
    var existing = getDaySession(dateStr);
    if (!existing) return Promise.resolve();
    var actions = JSON.parse(JSON.stringify(existing.actions));
    actions.splice(idx, 1);
    return saveDaySession(dateStr, actions, { completed: !!existing.completed });
  }
  // 「完成训练」：整场记完成 + 本次感受（mood 三档 0/1/2）。
  function completeDaySession(dateStr, mood) {
    var existing = getDaySession(dateStr);
    var actions = existing ? JSON.parse(JSON.stringify(existing.actions)) : [];
    return saveDaySession(dateStr, actions, { completed: true, mood: mood });
  }
  function sessionCompletedFor(dateStr) {
    var s = getDaySession(dateStr);
    return !!(s && s.completed);
  }
  // 删除该动作（模板来源）：在当天的模板会话记录里把该动作标记为 deleted，
  // 首页不再展示它，但不动模板本身、也不动其它动作。
  function removeTemplateExercise(dateStr, tid, exIdx) {
    var rec = sessionRecordFor(dateStr, tid);
    if (!rec) return Promise.resolve();
    var exercises = JSON.parse(JSON.stringify(rec.resistance.exercises));
    if (!exercises[exIdx]) return Promise.resolve();
    exercises[exIdx] = Object.assign({}, exercises[exIdx], { deleted: true });
    return saveRecord({
      id: rec.id, date: dateStr, type: 'resistance',
      templateId: tid, templateName: rec.templateName,
      resistance: { exercises: exercises },
      durationMinutes: rec.durationMinutes,
      completed: rec.completed,
      createdAt: rec.createdAt,
    });
  }
  // 周计划动作的当天删除覆盖。抗阻按「模板 + 动作下标」区分；有氧模板
  // 一条模板就是一个动作。覆盖仅影响当天，不修改周计划或训练模板。
  function plannedActionKey(type, tid, exIdx) {
    return type === 'cardio'
      ? 'cardio:' + tid
      : 'resistance:' + tid + ':' + exIdx;
  }
  function hiddenTemplateActionKeys(dateStr) {
    var session = getDaySession(dateStr);
    return (session && Array.isArray(session.hiddenTemplateActions))
      ? session.hiddenTemplateActions
      : [];
  }
  function hidePlannedTemplateAction(dateStr, type, tid, exIdx) {
    var existing = getDaySession(dateStr);
    var actions = existing ? JSON.parse(JSON.stringify(existing.actions || [])) : [];
    var hidden = hiddenTemplateActionKeys(dateStr).slice();
    var key = plannedActionKey(type, tid, exIdx);
    if (hidden.indexOf(key) === -1) hidden.push(key);
    return saveDaySession(dateStr, actions, {
      completed: existing ? !!existing.completed : false,
      hiddenTemplateActions: hidden,
    });
  }
  // ── 「同步到模板」：把本次组数据写回训练模板里的对应动作 ──
  // 单个动作：执行页「添加到计划中」按钮 + 「完成本动作」浮层的同步到模板。
  // 没有可同步数据（无模板/0 组）时 resolve(null)，调用方自行处理。
  function syncExerciseToTemplate(tid, exIdx, sets, fallbackNamePart) {
    var tpl = getTemplate(tid);
    if (!tpl || tpl.type !== 'resistance' || !sets || !sets.length) return Promise.resolve(null);
    var exercises = JSON.parse(JSON.stringify(tpl.exercises || []));
    var base = exercises[exIdx] || {};
    var updated = Object.assign({}, base, {
      name: (fallbackNamePart && fallbackNamePart.name) || base.name || '',
      part: (fallbackNamePart && fallbackNamePart.part) || base.part || '',
      sets: sets.map(function (s) { return { weight_kg: s.weight_kg, is_bodyweight: !!s.is_bodyweight, reps: s.reps }; }),
    });
    if (exercises[exIdx]) exercises[exIdx] = updated; else exercises.push(updated);
    var parts = [];
    exercises.forEach(function (ex) { if (ex.part && parts.indexOf(ex.part) === -1) parts.push(ex.part); });
    return saveTemplate({ id: tpl.id, type: 'resistance', name: tpl.name, parts: parts, exercises: exercises });
  }
  function syncCardioToTemplate(tid, action) {
    var tpl = getTemplate(tid);
    if (!tpl || tpl.type !== 'cardio') return Promise.resolve(null);
    return saveTemplate({
      id: tpl.id, type: 'cardio', name: tpl.name,
      action: action.name || tpl.action,
      speed: tpl.speed,
      duration: action.duration || tpl.duration,
    });
  }

  // 整场：「完成训练」浮层的同步到模板 —— 把当天安排里所有模板来源动作的本次
  // 数据写回对应模板（抗阻：组/重量；有氧模板：时长）。返回同步成功的动作数。
  function syncDayPlanToTemplates(dateStr) {
    var rows = dayPlanRows(dateStr);
    var jobs = [];
    rows.forEach(function (row) {
      if (row.src === 'tpl') {
        var sessionRec = sessionRecordFor(dateStr, row.tid);
        var ex = sessionRec && sessionRec.resistance.exercises[row.exIdx];
        if (ex && ex.sets && ex.sets.length) jobs.push(syncExerciseToTemplate(row.tid, row.exIdx, ex.sets, row.ex));
      } else if (row.src === 'cardio-tpl') {
        var rec = getRecordsByDate(dateStr).filter(function (r) { return r.type === 'cardio' && r.templateId === row.tpl.id; })[0];
        if (rec && rec.cardio && rec.cardio.duration) {
          jobs.push(saveTemplate({
            id: row.tpl.id, type: 'cardio', name: row.tpl.name,
            action: rec.cardio.action || row.tpl.action,
            speed: rec.cardio.speed != null ? rec.cardio.speed : row.tpl.speed,
            duration: rec.cardio.duration,
          }));
        }
      }
    });
    return Promise.all(jobs).then(function (results) { return results.filter(function (r) { return !!r; }).length; });
  }

  // 当天安排里是否存在可「同步到模板」的动作（决定完成训练浮层是否显示该勾选）
  function dayHasPlanSyncCandidates(dateStr) {
    return dayPlanRows(dateStr).some(function (row) {
      if (row.src === 'tpl') {
        var sessionRec = sessionRecordFor(dateStr, row.tid);
        var ex = sessionRec && sessionRec.resistance.exercises[row.exIdx];
        return !!(ex && ex.sets && ex.sets.length);
      }
      if (row.src === 'cardio-tpl') {
        return getRecordsByDate(dateStr).some(function (r) {
          return r.type === 'cardio' && r.templateId === row.tpl.id && r.cardio && r.cardio.duration;
        });
      }
      return false;
    });
  }

  function saveTemplate(tpl) {
    var exists = templatesCache.some(function (t) { return t.id === tpl.id; });
    var method = exists ? 'PUT' : 'POST';
    var path = exists ? '/api/templates/' + encodeURIComponent(tpl.id) : '/api/templates';
    return apiSend(method, path, tpl).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'save template failed');
      var saved = res.template;
      var i = templatesCache.findIndex(function (t) { return t.id === saved.id; });
      if (i >= 0) templatesCache[i] = saved; else templatesCache.push(saved);
      clearTrainingDrafts();
      return saved;
    });
  }
  function deleteTemplate(id) {
    return apiSend('DELETE', '/api/templates/' + encodeURIComponent(id)).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'delete template failed');
      templatesCache = templatesCache.filter(function (t) { return t.id !== id; });
      clearTrainingDrafts();
    });
  }

  function getRecords() { return recordsCache; }
  function getRecordsByDate(dateStr) { return recordsCache.filter(function (r) { return r.date === dateStr; }); }
  function getRecord(id) { return recordsCache.find(function (r) { return r.id === id; }); }
  function saveRecord(rec) {
    var exists = recordsCache.some(function (r) { return r.id === rec.id; });
    var method = exists ? 'PUT' : 'POST';
    var path = exists ? '/api/records/' + encodeURIComponent(rec.id) : '/api/records';
    return apiSend(method, path, rec).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'save record failed');
      var saved = res.record;
      var i = recordsCache.findIndex(function (r) { return r.id === saved.id; });
      if (i >= 0) recordsCache[i] = saved; else recordsCache.push(saved);
      return saved;
    });
  }
  function deleteRecord(id) {
    return apiSend('DELETE', '/api/records/' + encodeURIComponent(id)).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'delete record failed');
      recordsCache = recordsCache.filter(function (r) { return r.id !== id; });
    });
  }

  function estimateMinutes(rec) {
    if (rec.session) {
      // 当天动作级会话：有氧动作按时长、抗阻动作按组数估算，加起来。
      return (rec.actions || []).reduce(function (sum, a) {
        if (a.type === 'cardio') return sum + (a.duration || 0);
        return sum + ((a.sets || []).length || 1) * 8;
      }, 0);
    }
    if (rec.type === 'cardio') return rec.cardio.duration || 0;
    var n = (rec.resistance.exercises || []).length;
    return n * 8;
  }

  function computeWeekMinutes(records, weekStartStr) {
    var start = fromDateStr(weekStartStr);
    var end = addDays(start, 7);
    return records.filter(function (r) {
      if (!r.completed) return false;
      var d = fromDateStr(r.date);
      return d >= start && d < end;
    }).reduce(function (sum, r) { return sum + estimateMinutes(r); }, 0);
  }

  function computeMonthCount(records, monthStartStr) {
    var start = fromDateStr(monthStartStr);
    var end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return records.filter(function (r) {
      if (!r.completed) return false;
      var d = fromDateStr(r.date);
      return d >= start && d < end;
    }).length;
  }

  // 往前数连续打卡天数：某天没有已完成记录时，如果那天在计划里本来就是
  // 休息日（当天没有安排任何模板），就跳过不中断连续；否则中断。
  function computeStreak(records) {
    var doneDates = {};
    records.forEach(function (r) { if (r.completed) doneDates[r.date] = true; });
    var streak = 0;
    var cursor = new Date();
    var guard = 0;
    while (guard < 400) {
      guard++;
      if (doneDates[toDateStr(cursor)]) streak++;
      else if (!isRestDay(cursor)) break;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function templatePickCardHTML(t) {
    var summary = t.type === 'cardio'
      ? [t.action, t.speed ? t.speed + 'km/h' : null, t.duration + '分钟'].filter(Boolean).join(' · ')
      : (t.parts || []).join('/') + ' · ' + (t.exercises || []).length + '个动作';
    var badgeClass = t.type === 'cardio' ? 'tag--cardio' : 'tag--resistance';
    var badgeText = t.type === 'cardio' ? '有氧' : '抗阻';
    return '' +
      '<button class="pick-card" data-template-id="' + t.id + '">' +
        '<span class="tag ' + badgeClass + '">' + badgeText + '</span>' +
        '<span class="pick-card__body">' +
          '<span class="pick-card__name">' + escapeHtml(t.name) + '</span>' +
          '<span class="pick-card__summary">' + escapeHtml(summary) + '</span>' +
        '</span>' +
        '<span class="pick-card__chevron">' + ICONS.chevronRight + '</span>' +
      '</button>';
  }

  function recordTitle(rec) {
    if (rec.type === 'cardio') return rec.templateName || rec.cardio.action;
    return rec.templateName || '抗阻训练';
  }
  function recordMeta(rec) {
    if (rec.type === 'cardio') {
      var c = rec.cardio;
      return [c.action, c.speed ? c.speed + 'km/h' : null, c.duration + '分钟'].filter(Boolean).join(' · ');
    }
    var parts = [];
    (rec.resistance.exercises || []).forEach(function (e) { if (parts.indexOf(e.part) === -1) parts.push(e.part); });
    return parts.join('/') + ' · ' + (rec.resistance.exercises || []).length + '个动作';
  }

  function renderRecordCardHTML(rec) {
    var isCardio = rec.type === 'cardio';
    var icon = isCardio ? ICONS.run : ICONS.dumbbell;
    var editTarget = isCardio ? 'execute-cardio.html' : 'execute-resistance.html';
    var body = '';
    if (!isCardio) {
      body = (rec.resistance.exercises || []).map(function (ex) {
        var chips = (ex.sets || []).length
          ? ex.sets.map(function (s) { return '<span class="set-chip">' + escapeHtml(setWeightLabel(s)) + ' × ' + (s.reps != null ? s.reps + '次' : '-') + '</span>'; }).join('')
          : '<span class="set-chip">未记录组数</span>';
        return '' +
          '<div class="exercise-row">' +
            '<div class="exercise-row__name">' + escapeHtml(ex.name) + '</div>' +
            '<div class="set-chip-row">' + chips + '</div>' +
          '</div>';
      }).join('');
    }
    var statusBadge = rec.completed
      ? '<span class="status-badge status-badge--done">' + ICONS.check + '已完成</span>'
      : '<span class="status-badge status-badge--pending">未完成</span>';
    return '' +
      '<div class="record-card' + (body ? ' record-card--foldable' : '') + '" data-record-id="' + rec.id + '">' +
        '<div class="record-card__head">' +
          '<div class="record-card__icon record-card__icon--' + rec.type + '">' + icon + '</div>' +
          '<div class="record-card__info">' +
            '<div class="record-card__title-row">' +
              '<span class="record-card__title">' + escapeHtml(recordTitle(rec)) + '</span>' +
              statusBadge +
            '</div>' +
            '<div class="record-card__meta">' + escapeHtml(recordMeta(rec)) + '</div>' +
          '</div>' +
          (body ? '<button class="record-card__toggle" data-role="toggle-card" aria-label="展开明细" aria-expanded="false">' + ICONS.chevronRight + '</button>' : '') +
          '<a class="record-card__chevron" href="' + editTarget + '?rid=' + encodeURIComponent(rec.id) + '" aria-label="编辑">' + ICONS.chevronRight + '</a>' +
        '</div>' +
        (body ? '<div class="record-card__details">' + body + '</div>' : '') +
      '</div>';
  }

  function plannedTemplateSummary(t) {
    return t.type === 'cardio'
      ? [t.action, t.speed ? t.speed + 'km/h' : null, t.duration + '分钟'].filter(Boolean).join(' · ')
      : (t.parts || []).join('/') + ' · ' + (t.exercises || []).length + '个动作';
  }

  // ── 训练模块迭代：首页「训练安排」= 动作级清单 ──
  // 每条动作一行 route-card：[部位标签] + [动作名] + [组数/时长] + 行尾按钮。
  // 已完成：整行浅绿 +「已完成」+ 绿色「查看」；未完成：红色「去训练」。
  function routeCardHTML(opts) {
    var isCardio = opts.tagClass === 'tag--cardio';
    var right = opts.done
      ? '<span class="done-pill">' + ICONS.check + '已完成</span>' +
        '<a class="route-btn route-btn--view" href="' + escapeHtml(opts.href) + '">查看</a>'
      : '<a class="route-btn route-btn--go" href="' + escapeHtml(opts.href) + '">去训练</a>';
    return '' +
      '<article class="route-card' + (opts.done ? ' is-done' : '') + '">' +
        '<span class="tag' + (isCardio ? ' tag--cardio' : '') + '">' + escapeHtml(opts.tag) + '</span>' +
        '<div class="route-card__info">' +
          '<span class="route-card__name">' + escapeHtml(opts.name) + '</span>' +
          '<span class="route-card__sets">' + escapeHtml(opts.meta) + '</span>' +
        '</div>' +
        '<span class="route-card__right">' + right + '</span>' +
      '</article>';
  }

  // 单动作执行页链接：日期不放进 URL（首页写入 navDate，执行页读取），
  // 这样首页 URL 恒定、切日期也不改 URL。
  function sessionExerciseHref(exIdx) {
    return 'execute-resistance.html?ex=' + encodeURIComponent(exIdx);
  }
  function templateExerciseHref(tid, exIdx) {
    return 'execute-resistance.html?tid=' + encodeURIComponent(tid) + '&ex=' + encodeURIComponent(exIdx);
  }

  // 某天「训练安排」的扁平动作行描述（顺序 = 首页展示顺序）。
  // 来源：当天动作级会话（session=1 记录）+ 计划模板（抗阻逐动作、有氧整条）。
  function dayPlanRows(dateStr) {
    var rows = [];
    var session = getDaySession(dateStr);
    var hidden = {};
    hiddenTemplateActionKeys(dateStr).forEach(function (key) { hidden[key] = true; });
    (session && session.actions || []).forEach(function (a, idx) {
      rows.push({ src: 'session', sessionId: session.id, idx: idx, a: a });
    });
    getPlannedTemplatesForDate(fromDateStr(dateStr)).forEach(function (t) {
      if (t.type === 'resistance') {
        var sessionRec = sessionRecordFor(dateStr, t.id);
        (t.exercises || []).forEach(function (ex, exIdx) {
          var recEx = sessionRec && sessionRec.resistance.exercises[exIdx];
          // 删除后的当天覆盖，或已有会话里的 deleted 标记，都不再展示。
          if ((recEx && recEx.deleted) || hidden[plannedActionKey('resistance', t.id, exIdx)]) return;
          rows.push({ src: 'tpl', tid: t.id, tpl: t, exIdx: exIdx, ex: ex, recEx: recEx, sessionRec: sessionRec });
        });
      } else {
        if (hidden[plannedActionKey('cardio', t.id)]) return;
        rows.push({ src: 'cardio-tpl', tid: t.id, tpl: t });
      }
    });
    return rows;
  }

  function dayRowDone(row, dateStr) {
    if (row.src === 'session') return !!row.a.done;
    if (row.src === 'tpl') return row.recEx ? !!(row.recEx.done || row.sessionRec.completed) : false;
    var rec = getRecordsByDate(dateStr).filter(function (r) { return r.type === 'cardio' && r.templateId === row.tpl.id; })[0];
    return !!(rec && rec.completed);
  }

  // 首页「训练安排」的完成统计：{rows, doneCount, total, allDone}
  function dayPlanState(dateStr) {
    var rows = dayPlanRows(dateStr);
    var doneCount = rows.filter(function (r) { return dayRowDone(r, dateStr); }).length;
    return { rows: rows, doneCount: doneCount, total: rows.length, allDone: rows.length > 0 && doneCount === rows.length };
  }

  function renderDayRow(row, dateStr) {
    if (row.src === 'session') {
      var a = row.a;
      var isCardio = a.type === 'cardio';
      return routeCardHTML({
        tag: isCardio ? '有氧' : (a.part || '抗阻'),
        tagClass: isCardio ? 'tag--cardio' : '',
        name: a.name,
        meta: isCardio ? ((a.duration || 30) + ' 分钟') : (((a.sets || []).length || a.plan_sets || 0) + ' 组'),
        done: !!a.done,
        href: sessionExerciseHref(row.idx),
      });
    }
    if (row.src === 'tpl') {
      var done = row.recEx ? !!(row.recEx.done || row.sessionRec.completed) : false;
      var setCount = row.recEx ? (row.recEx.sets || []).length : (row.ex.sets || []).length;
      return routeCardHTML({
        tag: row.ex.part || '抗阻',
        tagClass: '',
        name: row.ex.name,
        meta: setCount + ' 组',
        done: done,
        href: templateExerciseHref(row.tid, row.exIdx),
      });
    }
    // 有氧计划模板（老数据路径）：有已完成记录则「查看」其记录，否则去训练。
    var t = row.tpl;
    var rec = getRecordsByDate(dateStr).filter(function (r) { return r.type === 'cardio' && r.templateId === t.id; })[0];
    return routeCardHTML({
      tag: '有氧',
      tagClass: 'tag--cardio',
      name: t.action || t.name,
      meta: (t.duration || 30) + ' 分钟',
      done: !!(rec && rec.completed),
      href: (rec && rec.completed)
        ? 'execute-cardio.html?rid=' + encodeURIComponent(rec.id)
        : 'execute-cardio.html?tid=' + encodeURIComponent(t.id),
    });
  }

  function emptyDayStateHTML() {
    return '' +
      '<div class="empty-state">' +
        '<div class="empty-state__icon">' + ICONS.calendarPlus + '</div>' +
        '<div class="empty-state__text">这一天还没有训练安排，点击下方按钮新增一次</div>' +
      '</div>';
  }

  function renderDayContentHTML(dateStr) {
    var state = dayPlanState(dateStr);
    var html = '';
    if (state.rows.length) {
      html += '<div class="route-list">' + state.rows.map(function (r) { return renderDayRow(r, dateStr); }).join('') + '</div>';
    }
    // 历史遗留的独立记录（非当天动作级会话、非当前计划里的抗阻模板会话）
    // 仍以记录卡形式展示，老数据不丢。有氧模板完成记录已在「训练安排」里以
    // 动作行展示，不再重复渲染成记录卡。
    var recs = getRecordsByDate(dateStr).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    var sessionId = (getDaySession(dateStr) || {}).id;
    var sessionTidMap = {};
    var plannedCardioTids = {};
    getPlannedTemplatesForDate(fromDateStr(dateStr)).forEach(function (t) {
      if (t.type === 'resistance' && sessionRecordFor(dateStr, t.id)) sessionTidMap[t.id] = true;
      if (t.type === 'cardio') plannedCardioTids[t.id] = true;
    });
    recs.forEach(function (r) {
      if (r.id === sessionId) return;
      if (r.templateId && (sessionTidMap[r.templateId] || plannedCardioTids[r.templateId])) return;
      html += renderRecordCardHTML(r);
    });
    return html || emptyDayStateHTML();
  }

  function openConfirmModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '' +
        '<div class="modal-overlay__scrim"></div>' +
        '<div class="modal" role="alertdialog" aria-modal="true">' +
          '<div class="modal__title">' + escapeHtml(opts.title || '确认') + '</div>' +
          (opts.message ? '<div class="modal__sub">' + escapeHtml(opts.message) + '</div>' : '') +
          '<div class="modal__actions">' +
            '<button class="btn btn--ghost" data-role="cancel">' + escapeHtml(opts.cancelText || '取消') + '</button>' +
            '<button class="btn btn--primary" data-role="confirm"' + (opts.danger ? ' style="background:var(--danger)"' : '') + '>' + escapeHtml(opts.confirmText || '确认') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add('is-open'); });
      function close(result) {
        overlay.classList.remove('is-open');
        setTimeout(function () { overlay.remove(); }, 200);
        resolve(result);
      }
      overlay.querySelector('.modal-overlay__scrim').addEventListener('click', function () { close(false); });
      overlay.querySelector('[data-role="cancel"]').addEventListener('click', function () { close(false); });
      overlay.querySelector('[data-role="confirm"]').addEventListener('click', function () { close(true); });
    });
  }

  function openPromptModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '' +
        '<div class="modal-overlay__scrim"></div>' +
        '<div class="modal" role="alertdialog" aria-modal="true">' +
          '<div class="modal__title">' + escapeHtml(opts.title || '') + '</div>' +
          (opts.message ? '<div class="modal__sub">' + escapeHtml(opts.message) + '</div>' : '') +
          '<input type="text" class="text-input" data-role="input" style="width:100%;margin-top:2px;" placeholder="' + escapeHtml(opts.placeholder || '') + '" value="' + escapeHtml(opts.initialValue || '') + '" />' +
          '<div class="modal__actions">' +
            '<button class="btn btn--ghost" data-role="cancel">' + escapeHtml(opts.cancelText || '取消') + '</button>' +
            '<button class="btn btn--primary" data-role="confirm">' + escapeHtml(opts.confirmText || '确定') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      var inputEl = overlay.querySelector('[data-role="input"]');
      requestAnimationFrame(function () {
        overlay.classList.add('is-open');
        inputEl.focus();
        inputEl.select();
      });
      function close(result) {
        overlay.classList.remove('is-open');
        setTimeout(function () { overlay.remove(); }, 200);
        resolve(result);
      }
      function confirm() {
        var val = inputEl.value.trim();
        if (!val) { inputEl.focus(); return; }
        close(val);
      }
      inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirm(); });
      overlay.querySelector('.modal-overlay__scrim').addEventListener('click', function () { close(null); });
      overlay.querySelector('[data-role="cancel"]').addEventListener('click', function () { close(null); });
      overlay.querySelector('[data-role="confirm"]').addEventListener('click', confirm);
    });
  }

  // opts.dateEl/opts.actionsEl（可选）：日期标题和"今天"+日历按钮改成渲染到
  // 调用方指定的两个独立容器里（比如放进顶部条，跟 week-strip/cal-panel 分开
  // 摆放），不传的话就还是老样子，全部渲染进 container 内部一个 .date-nav__head。
  function createDateNav(container, opts) {
    opts = opts || {};
    var current = opts.initialDate ? new Date(opts.initialDate) : new Date();
    var monthCursor = new Date(current.getFullYear(), current.getMonth(), 1);
    var isOpen = false;
    var split = !!(opts.dateEl && opts.actionsEl);

    var dateHTML = '' +
      '<div class="date-nav__title" data-role="title"></div>' +
      '<div class="date-nav__sub" data-role="sub"></div>';
    var actionsHTML = '' +
      '<button class="date-nav__today-btn" data-role="today">今天</button>' +
      '<button class="icon-btn date-nav__cal-btn" data-role="toggle-cal" aria-label="选择日期">' + ICONS.calendar + '</button>';

    if (split) {
      opts.dateEl.innerHTML = dateHTML;
      opts.actionsEl.innerHTML = actionsHTML;
    }

    container.innerHTML = '' +
      (split ? '' :
        '<div class="date-nav__head">' +
          '<div class="date-nav__date">' + dateHTML + '</div>' +
          '<div class="date-nav__actions">' + actionsHTML + '</div>' +
        '</div>') +
      '<div class="week-strip" data-role="week-strip"></div>' +
      '<div class="cal-scrim" data-role="cal-scrim"></div>' +
      '<div class="cal-panel" data-role="cal-panel">' +
        '<div class="month-nav">' +
          '<button class="nav-arrow" data-role="month-prev" aria-label="上个月">' + ICONS.chevronLeft + '</button>' +
          '<div class="month-nav__label" data-role="month-label"></div>' +
          '<button class="nav-arrow" data-role="month-next" aria-label="下个月">' + ICONS.chevronRight + '</button>' +
        '</div>' +
        '<div class="month-grid" data-role="month-grid"></div>' +
      '</div>';

    var elTitle = (split ? opts.dateEl : container).querySelector('[data-role="title"]');
    var elSub = (split ? opts.dateEl : container).querySelector('[data-role="sub"]');
    var elToday = (split ? opts.actionsEl : container).querySelector('[data-role="today"]');
    var elToggle = (split ? opts.actionsEl : container).querySelector('[data-role="toggle-cal"]');
    var elPanel = container.querySelector('[data-role="cal-panel"]');
    var elScrim = container.querySelector('[data-role="cal-scrim"]');
    var elMonthLabel = container.querySelector('[data-role="month-label"]');
    var elMonthGrid = container.querySelector('[data-role="month-grid"]');
    var elWeekStrip = container.querySelector('[data-role="week-strip"]');

    function renderHeader() {
      var today = new Date();
      elTitle.textContent = formatMD(current);
      elSub.textContent = '周' + WEEKDAYS_SHORT[weekdayIndexMonFirst(current)] + (isSameDate(current, today) ? ' · 今天' : '');
      elToday.classList.toggle('is-current', isSameDate(current, today));
    }

    function renderWeekStrip() {
      var weekStart = startOfWeek(current);
      var today = new Date();
      var html = '';
      for (var i = 0; i < 7; i++) {
        var d = addDays(weekStart, i);
        var dateStr = toDateStr(d);
        var isToday = isSameDate(d, today);
        var isSelected = isSameDate(d, current);
        html += '' +
          '<button class="week-strip__cell' + (isToday ? ' is-today' : '') + (isSelected ? ' is-selected' : '') + '" data-date="' + dateStr + '">' +
            '<span class="week-strip__wd">' + WEEKDAYS_SHORT[i] + '</span>' +
            '<span class="week-strip__num">' + d.getDate() + '</span>' +
            '<span class="week-strip__dots">' + dotHTMLForDate(dateStr, 'week-strip__dot') + '</span>' +
          '</button>';
      }
      elWeekStrip.innerHTML = html;
      elWeekStrip.querySelectorAll('[data-date]').forEach(function (el) {
        el.addEventListener('click', function () { selectDate(fromDateStr(el.getAttribute('data-date'))); });
      });
    }

    function renderMonthGrid() {
      var y = monthCursor.getFullYear(), m = monthCursor.getMonth();
      elMonthLabel.textContent = y + '年' + (m + 1) + '月';
      var first = new Date(y, m, 1);
      var startOffset = weekdayIndexMonFirst(first);
      var gridStart = addDays(first, -startOffset);
      var today = new Date();
      var wdHtml = WEEKDAYS_SHORT.map(function (w) { return '<div class="month-grid__wd">' + w + '</div>'; }).join('');
      var cellsHtml = '';
      for (var i = 0; i < 42; i++) {
        var d = addDays(gridStart, i);
        var dateStr = toDateStr(d);
        var otherMonth = d.getMonth() !== m;
        var isToday = isSameDate(d, today);
        var isSelected = isSameDate(d, current);
        cellsHtml += '' +
          '<button class="month-cell' + (isToday ? ' is-today' : '') + (otherMonth ? ' is-otherMonth' : '') + (isSelected ? ' is-selected' : '') + '" data-date="' + dateStr + '">' +
            '<span class="month-cell__num">' + d.getDate() + '</span>' +
            '<span class="month-cell__dots">' + dotHTMLForDate(dateStr, 'month-cell__dot') + '</span>' +
          '</button>';
      }
      elMonthGrid.innerHTML = wdHtml + cellsHtml;
      elMonthGrid.querySelectorAll('[data-date]').forEach(function (el) {
        el.addEventListener('click', function () {
          selectDate(fromDateStr(el.getAttribute('data-date')));
          closePanel();
        });
      });
    }

    function positionPanel() {
      var anchor = container.getBoundingClientRect();
      var frame = (container.closest && container.closest('.page')) || document.body;
      var box = frame.getBoundingClientRect();
      elPanel.style.top = Math.round(anchor.bottom + 6) + 'px';
      elPanel.style.left = Math.round(box.left + 12) + 'px';
      elPanel.style.width = Math.round(box.width - 24) + 'px';
    }
    function openPanel() {
      isOpen = true;
      monthCursor = new Date(current.getFullYear(), current.getMonth(), 1);
      renderMonthGrid();
      positionPanel();
      elPanel.classList.add('is-open');
      elScrim.classList.add('is-open');
      elToggle.classList.add('is-open');
    }
    function closePanel() {
      isOpen = false;
      elPanel.classList.remove('is-open');
      elScrim.classList.remove('is-open');
      elToggle.classList.remove('is-open');
    }
    function togglePanel() { if (isOpen) closePanel(); else openPanel(); }

    function selectDate(d) {
      current = d;
      renderHeader();
      renderWeekStrip();
      if (isOpen) renderMonthGrid();
      if (opts.onChange) opts.onChange(toDateStr(current));
    }

    elToggle.addEventListener('click', togglePanel);
    elScrim.addEventListener('click', closePanel);
    var scroller = container.closest && container.closest('.content');
    if (scroller) scroller.addEventListener('scroll', function () { if (isOpen) closePanel(); });
    window.addEventListener('resize', function () { if (isOpen) positionPanel(); });
    elToday.addEventListener('click', function () { selectDate(new Date()); closePanel(); });
    container.querySelector('[data-role="month-prev"]').addEventListener('click', function () { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1); renderMonthGrid(); });
    container.querySelector('[data-role="month-next"]').addEventListener('click', function () { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1); renderMonthGrid(); });

    renderHeader();
    renderWeekStrip();

    return {
      getDate: function () { return current; },
      setDate: function (d) { current = new Date(d); renderHeader(); renderWeekStrip(); },
      refreshMonthGrid: function () { if (isOpen) renderMonthGrid(); },
      refreshWeekStrip: renderWeekStrip,
    };
  }

  // 共享的"动作-组"编辑器，template-edit.html 和 execute-resistance.html 都用
  // 这一套渲染+绑定，避免重复维护两份几乎相同的代码。
  // 中文输入法下小键盘打出来的是「。」，在重量/次数框里直接当小数点用，
  // 省得为了一个点来回切输入法；顺手把全角数字也转成半角。
  function normalizeNumericInput(raw) {
    return String(raw)
      .replace(/[。．｡]/g, '.')
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  }

  // opts.showDone：每组末尾挂一个"完成"复选框（只有执行训练页用得到，
  // 模板编辑页的组是计划值，没有"做没做完"这回事）。
  function setRowHTML(exIdx, set, setIdx, opts) {
    opts = opts || {};
    var isBw = !!set.is_bodyweight;
    var weightVal = set.weight_kg != null ? String(set.weight_kg) : '';
    var repsVal = set.reps != null ? String(set.reps) : '';
    return '' +
      '<div class="set-row' + (set.done ? ' is-done' : '') + '" data-ex="' + exIdx + '" data-set="' + setIdx + '">' +
        '<button class="set-row__del" data-role="del" aria-label="删除该组">' + ICONS.close + '</button>' +
        '<span class="set-row__idx">第' + (setIdx + 1) + '组</span>' +
        '<button class="bw-toggle' + (isBw ? ' is-active' : '') + '" data-role="bw">自重</button>' +
        '<input class="set-row__input" type="text" inputmode="decimal" placeholder="重量kg" data-role="weight" value="' + escapeHtml(weightVal) + '"' + (isBw ? ' disabled' : '') + ' />' +
        // 次数也用 text 而不是 number：number 框收到「。」会直接把 value 清空，
        // 拿不到原始字符也就没法转成小数点。
        '<input class="set-row__input" type="text" inputmode="numeric" placeholder="次数" data-role="reps" value="' + escapeHtml(repsVal) + '" />' +
        (opts.showDone
          ? '<label class="set-row__done"><input type="checkbox" data-role="done"' + (set.done ? ' checked' : '') + ' /><span class="set-row__done-box">' + ICONS.check + '</span></label>'
          : '') +
      '</div>';
  }

  // opts.collapsible（可选，默认 false）：只显示已展开的那一个动作的组信息，
  // 其余动作收拢成一行标题，点击标题切换展开——展开态由调用方在 opts.expandedIndex 里维护。
  // opts.showDone（可选）：往下传给 setRowHTML。
  function renderExercisesListHTML(exercises, opts) {
    opts = opts || {};
    var collapsible = !!opts.collapsible;
    return exercises.map(function (ex, exIdx) {
      var isExpanded = !collapsible || exIdx === opts.expandedIndex;
      var setsHtml = isExpanded
        ? ex.sets.map(function (s, si) { return setRowHTML(exIdx, s, si, opts); }).join('') +
          '<button class="add-set-btn" data-add-set="' + exIdx + '">＋ 添加组</button>'
        : '';
      var doneCount = ex.sets.filter(function (s) { return s.done; }).length;
      var summaryText = opts.showDone && doneCount
        ? doneCount + '/' + ex.sets.length + ' 组'
        : ex.sets.length + ' 组';
      var summary = collapsible ? '<span class="exercise-editor__summary">' + summaryText + '</span>' : '';
      var chevron = collapsible ? '<span class="exercise-editor__chevron">' + ICONS.chevronRight + '</span>' : '';
      return '' +
        '<div class="exercise-editor' + (collapsible ? ' exercise-editor--collapsible' : '') + (isExpanded ? ' is-expanded' : '') + '" data-ex-idx="' + exIdx + '">' +
          '<div class="exercise-editor__head"' + (collapsible ? ' data-role="toggle-exercise"' : '') + '>' +
            '<span class="tag tag--resistance">' + ex.part + '</span>' +
            '<span class="exercise-editor__name">' + escapeHtml(ex.name) + '</span>' +
            summary + chevron +
            '<button class="icon-btn icon-btn--ghost" data-remove-ex="' + exIdx + '" aria-label="移除动作">' + ICONS.trash + '</button>' +
          '</div>' +
          setsHtml +
        '</div>';
    }).join('');
  }

  // rerenderList: 重绘动作/组编辑器本身；refreshActions（可选）：额外刷新部位下方
  // 的动作选择 chip 高亮态（仅"移除动作"需要）；opts.onChange（可选）：任何一次
  // 改动之后回调一次，执行训练页用它做自动保存。
  function bindExerciseListEvents(box, state, rerenderList, refreshActions, opts) {
    opts = opts || {};
    function changed() { if (opts.onChange) opts.onChange(); }
    function setOf(el) {
      var row = el.closest('.set-row');
      return state.exercises[Number(row.getAttribute('data-ex'))].sets[Number(row.getAttribute('data-set'))];
    }
    box.querySelectorAll('[data-remove-ex]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.exercises.splice(Number(btn.getAttribute('data-remove-ex')), 1);
        if (refreshActions) refreshActions();
        rerenderList();
        changed();
      });
    });
    box.querySelectorAll('[data-add-set]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // 新的一组默认沿用上一组的重量/次数——同一个动作连做几组，
        // 绝大多数时候数字是一样的，重复输入很烦。
        var sets = state.exercises[Number(btn.getAttribute('data-add-set'))].sets;
        var prev = sets[sets.length - 1];
        sets.push(prev
          ? { weight_kg: prev.weight_kg, is_bodyweight: !!prev.is_bodyweight, reps: prev.reps, done: false }
          : { weight_kg: null, is_bodyweight: false, reps: null, done: false });
        rerenderList();
        changed();
      });
    });
    box.querySelectorAll('[data-role="del"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.set-row');
        state.exercises[Number(row.getAttribute('data-ex'))].sets.splice(Number(row.getAttribute('data-set')), 1);
        rerenderList();
        changed();
      });
    });
    box.querySelectorAll('[data-role="bw"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var set = setOf(btn);
        set.is_bodyweight = !set.is_bodyweight;
        if (set.is_bodyweight) set.weight_kg = null;
        rerenderList();
        changed();
      });
    });
    box.querySelectorAll('[data-role="weight"]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var fixed = normalizeNumericInput(inp.value);
        if (fixed !== inp.value) inp.value = fixed;
        var set = setOf(inp);
        set.weight_kg = fixed === '' ? null : Number(fixed);
        if (fixed !== '') set.is_bodyweight = false;
        changed();
      });
    });
    box.querySelectorAll('[data-role="reps"]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var fixed = normalizeNumericInput(inp.value);
        if (fixed !== inp.value) inp.value = fixed;
        var set = setOf(inp);
        set.reps = fixed === '' ? null : Number(fixed);
        changed();
      });
    });
    box.querySelectorAll('[data-role="done"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        // 只切 class 不重绘：重绘会把焦点和滚动位置一起弄丢
        setOf(cb).done = cb.checked;
        cb.closest('.set-row').classList.toggle('is-done', cb.checked);
        changed();
      });
    });
  }

  // 卡片折叠：委托在 document 上，卡片是 innerHTML 重渲染的，逐个绑事件会漏。
  document.addEventListener('click', function (e) {
    var card = e.target.closest ? e.target.closest('.record-card--foldable') : null;
    if (!card) return;
    // 卡片右侧的"编辑"链接和"去训练"按钮不参与折叠
    if (e.target.closest('.record-card__chevron')) return;
    if (e.target.closest('[data-role="go-card-train"]')) return;
    if (!e.target.closest('.record-card__head')) return;
    var expanded = card.classList.toggle('is-expanded');
    var toggle = card.querySelector('[data-role="toggle-card"]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.setAttribute('aria-label', expanded ? '收起明细' : '展开明细');
    }
  });

  // 旧版整行点击（data-role="open-exercise"）路径已由 route-card 的链接替代。
  function exerciseNavHref(tid, exIdx) {
    return templateExerciseHref(tid, exIdx);
  }

  window.Workout = {
    ready: ready,
    ACTIONS_BY_PART: ACTIONS_BY_PART, BODY_PARTS: BODY_PARTS, CARDIO_ACTIONS: CARDIO_ACTIONS,
    ICONS: ICONS, uid: uid, pad: pad, toDateStr: toDateStr, fromDateStr: fromDateStr, addDays: addDays,
    todayStr: todayStr, isSameDate: isSameDate, WEEKDAYS_SHORT: WEEKDAYS_SHORT, WEEKDAY_KEYS: WEEKDAY_KEYS, WEEKDAY_LABELS: WEEKDAY_LABELS,
    weekdayIndexMonFirst: weekdayIndexMonFirst, weekdayKeyForDate: weekdayKeyForDate, startOfWeek: startOfWeek, formatMD: formatMD, formatMDWeekday: formatMDWeekday,
    escapeHtml: escapeHtml, setWeightLabel: setWeightLabel, formatSessionDuration: formatSessionDuration,
    setNavDate: setNavDate, getNavDate: getNavDate,
    getTemplates: getTemplates, saveTemplate: saveTemplate, deleteTemplate: deleteTemplate, getTemplate: getTemplate,
    getRecords: getRecords, getRecordsByDate: getRecordsByDate, saveRecord: saveRecord, deleteRecord: deleteRecord, getRecord: getRecord,
    getWeeklyPlan: getWeeklyPlan, saveWeeklyPlan: saveWeeklyPlan, getPlannedTemplatesForDate: getPlannedTemplatesForDate,
    sessionRecordFor: sessionRecordFor, saveSessionExercise: saveSessionExercise,
    // 训练模块迭代：当天动作级会话
    getDaySession: getDaySession, saveDaySession: saveDaySession, addActionsToDay: addActionsToDay,
    updateDayAction: updateDayAction, deleteDayAction: deleteDayAction, completeDaySession: completeDaySession,
    removeTemplateExercise: removeTemplateExercise, hidePlannedTemplateAction: hidePlannedTemplateAction,
    sessionCompletedFor: sessionCompletedFor,
    syncExerciseToTemplate: syncExerciseToTemplate, syncCardioToTemplate: syncCardioToTemplate,
    syncDayPlanToTemplates: syncDayPlanToTemplates,
    dayHasPlanSyncCandidates: dayHasPlanSyncCandidates,
    clearTrainingDrafts: clearTrainingDrafts, dropOutdatedDrafts: dropOutdatedDrafts,
    getActionLibrary: getActionLibrary, saveActionLibrary: saveActionLibrary,
    estimateMinutes: estimateMinutes, computeWeekMinutes: computeWeekMinutes, computeMonthCount: computeMonthCount, computeStreak: computeStreak,
    createDateNav: createDateNav,
    recordTitle: recordTitle, recordMeta: recordMeta, renderRecordCardHTML: renderRecordCardHTML,
    renderDayContentHTML: renderDayContentHTML,
    // 首页「训练安排」动作级清单
    routeCardHTML: routeCardHTML, dayPlanRows: dayPlanRows, dayPlanState: dayPlanState, renderDayRow: renderDayRow,
    sessionExerciseHref: sessionExerciseHref, templateExerciseHref: templateExerciseHref, exerciseNavHref: exerciseNavHref,
    openConfirmModal: openConfirmModal, openPromptModal: openPromptModal,
    setRowHTML: setRowHTML, renderExercisesListHTML: renderExercisesListHTML, bindExerciseListEvents: bindExerciseListEvents,
    normalizeNumericInput: normalizeNumericInput,
  };
})();
