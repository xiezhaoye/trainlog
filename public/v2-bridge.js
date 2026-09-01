/* v2-bridge.js —— 把 v2 原型页接到真实后端（window.Workout / assets/app.js）。
 *
 * v2 原型原本把数据存 localStorage；本桥接层让各 v2 页面直接读/写后端：
 *  - 动作列表：合并「当天动作级会话（session=1）」与「计划模板动作」的扁平清单
 *  - 保存动作：按 src 路由（session → 当天会话；tpl → 模板会话；cardio 模板 → 记录）
 *  - 记录 / 模板 / 周计划 / 动作库 直接透传 window.Workout
 *  - 皮肤/单位等客户端偏好仍走 localStorage，不入库
 */
(function () {
  'use strict';
  var W = window.Workout;
  if (!W) { window.V2 = { ready: Promise.reject(new Error('Workout 未加载')) }; return; }

  function mapSets(sets) {
    return (sets || []).map(function (s) {
      return { weight_kg: s.weight_kg, is_bodyweight: !!s.is_bodyweight, reps: s.reps, done: !!s.done };
    });
  }
  function today() { return W.todayStr(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtMDWeekday(dateStr) {
    var d = W.fromDateStr(dateStr); return (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + W.WEEKDAYS_SHORT[W.weekdayIndexMonFirst(d)];
  }

  // ── 把后端 dayPlanRows 的一行转成 v2 动作对象（含 src/tid/ex 便于回写） ──
  function rowToAction(row) {
    if (row.src === 'session') {
      var a = row.a;
      return {
        id: a.id || ('s-' + row.idx),
        type: a.type, part: a.part, name: a.name,
        src: 'session', idx: row.idx,
        plan_sets: a.plan_sets || 0, done: !!a.done, notes: a.notes || '',
        sets: mapSets(a.sets), duration: a.duration,
      };
    }
    if (row.src === 'tpl') {
      var ex = row.ex, recEx = row.recEx;
      return {
        id: 'tpl:' + row.tid + ':' + row.exIdx,
        type: 'resistance', part: ex.part, name: ex.name,
        src: 'tpl', tid: row.tid, ex: row.exIdx,
        plan_sets: (ex.sets || []).length,
        done: !!(recEx && (recEx.done || row.sessionRec.completed)),
        notes: (recEx && recEx.notes) || '',
        sets: mapSets((recEx && recEx.sets) || ex.sets),
        duration: null,
      };
    }
    if (row.src === 'cardio-tpl') {
      var t = row.tpl;
      var rec = W.getRecordsByDate(today()).filter(function (r) { return r.type === 'cardio' && r.templateId === t.id; })[0];
      return {
        id: 'ctpl:' + t.id,
        type: 'cardio', part: '有氧', name: t.action || t.name,
        src: 'tpl', tid: t.id,
        plan_sets: 0, done: !!(rec && rec.completed), notes: '',
        sets: [], duration: t.duration || 30,
      };
    }
    return null;
  }

  // ── 某天的扁平动作清单（v2 形状） ──
  function actionsFor(dateStr) {
    var ds = dateStr || today();
    return W.dayPlanRows(ds).map(rowToAction).filter(Boolean);
  }

  // ── 会话完成态/感受 ──
  function metaOf(dateStr) {
    var ds = dateStr || today();
    var s = W.getDaySession(ds);
    return { completed: !!(s && s.completed), mood: (s && s.mood != null) ? s.mood : 1 };
  }

  // ── 保存一个动作（按 src 路由到当天会话 / 模板会话 / 有氧记录） ──
  function cardioRecordFor(ds, tid) {
    return W.getRecordsByDate(ds).filter(function (r) { return r.type === 'cardio' && r.templateId === tid; })[0] || null;
  }
  // 有氧模板动作：完成/改时长 = 创建/更新当天的 cardio 记录
  function saveCardioRecord(ds, action) {
    var rec = cardioRecordFor(ds, action.tid);
    var tpl = W.getTemplate(action.tid);
    var base = rec || { id: W.uid('r'), date: ds, type: 'cardio', templateId: action.tid, templateName: (tpl && tpl.name) || '有氧', createdAt: Date.now() };
    base.cardio = { action: action.name, speed: (tpl && tpl.speed != null) ? tpl.speed : null, duration: action.duration || 30 };
    base.durationMinutes = action.duration || 30;
    base.completed = !!action.done;
    return W.saveRecord(base);
  }
  function saveAction(dateStr, action) {
    var ds = dateStr || today();
    var sets = mapSets(action.sets);
    var patch = {
      sets: sets, notes: action.notes || '',
      first_set_ts: action.first_set_ts || null,
      finish_ts: action.finish_ts || null,
      duration: action.type === 'cardio' ? action.duration : null,
      done: !!action.done,
    };
    if (action.src === 'tpl' && action.tid != null) {
      // 有氧模板动作 → 当天 cardio 记录；抗阻模板动作 → 模板会话
      if (action.type === 'cardio') return saveCardioRecord(ds, action);
      return W.saveSessionExercise(ds, action.tid, action.ex, patch, !!action.done);
    }
    // session（或兜底：按当天会话下标）
    var session = W.getDaySession(ds);
    if (!session) return Promise.reject(new Error('当天还没有训练安排'));
    var idx = action.idx;
    if (idx == null) idx = session.actions.findIndex(function (a) { return a.id === action.id; });
    if (idx < 0) return Promise.reject(new Error('动作不存在'));
    return W.updateDayAction(ds, idx, patch);
  }

  // ── 新增动作（加入当天动作级会话） ──
  function addActions(dateStr, actionsToAdd) {
    var ds = dateStr || today();
    return W.addActionsToDay(ds, actionsToAdd);
  }

  // ── 删除动作 ──
  function deleteAction(dateStr, action) {
    var ds = dateStr || today();
    // 周计划动作不会写入当天会话。删除时写入当天覆盖，否则首页下一次按周
    // 计划合成时会重新显示它；已经生成的训练记录则一并删除。
    if (action.src === 'tpl' && action.tid != null) {
      if (action.type === 'cardio') {
        var rec = cardioRecordFor(ds, action.tid);
        var removeRecord = rec ? W.deleteRecord(rec.id) : Promise.resolve();
        return removeRecord.then(function () {
          return W.hidePlannedTemplateAction(ds, 'cardio', action.tid);
        });
      }
      return W.removeTemplateExercise(ds, action.tid, action.ex).then(function () {
        return W.hidePlannedTemplateAction(ds, 'resistance', action.tid, action.ex);
      });
    }
    var session = W.getDaySession(ds);
    if (!session) return Promise.resolve();
    var idx = action.idx;
    if (idx == null) idx = session.actions.findIndex(function (a) { return a.id === action.id; });
    if (idx < 0) return Promise.resolve();
    return W.deleteDayAction(ds, idx);
  }

  // ── 完成本动作 ──
  function completeAction(dateStr, action) {
    var ds = dateStr || today();
    var finishTs = Date.now();
    action.done = true;
    action.finish_ts = finishTs;
    return saveAction(ds, action);
  }

  // ── 完成训练（整场） ──
  function completeSession(dateStr, mood, syncPlan) {
    var ds = dateStr || today();
    return W.completeDaySession(ds, mood).then(function () {
      if (!syncPlan) return null;
      return W.syncDayPlanToTemplates(ds).catch(function () { return 0; });
    });
  }

  // ── 记录 / 模板 / 计划 / 动作库 透传 ──
  function records() { return W.getRecords(); }
  function saveBackfill(rec) { return W.saveRecord(rec); }
  function deleteRecord(id) { return W.deleteRecord(id); }
  function templates() { return W.getTemplates(); }
  function saveTemplate(tpl) { return W.saveTemplate(tpl); }
  function deleteTemplate(id) { return W.deleteTemplate(id); }
  function plan() { return W.getWeeklyPlan(); }
  function savePlan(p) { return W.saveWeeklyPlan(p); }
  function library() { return W.getActionLibrary(); }
  function saveLibrary(parts) { return W.saveActionLibrary(parts); }

  // ── 单位换算（lb/kg，客户端偏好） ──
  var LB = 2.2046226218;
  function wtDisplay(kg, unit) { if (kg == null || kg === '') return ''; return unit === 'lb' ? String(Math.round(kg / LB * 10) / 10) : String(kg); }
  function wtStore(v, unit) { return unit === 'lb' ? Math.round(v * LB * 2) / 2 : v; }

  window.V2 = {
    ready: W.ready, W: W, today: today, fmtMDWeekday: fmtMDWeekday,
    actionsFor: actionsFor, rowToAction: rowToAction,
    metaOf: metaOf, saveAction: saveAction, addActions: addActions,
    deleteAction: deleteAction, completeAction: completeAction, completeSession: completeSession,
    records: records, saveBackfill: saveBackfill, deleteRecord: deleteRecord,
    templates: templates, saveTemplate: saveTemplate, deleteTemplate: deleteTemplate,
    plan: plan, savePlan: savePlan, library: library, saveLibrary: saveLibrary,
    wtDisplay: wtDisplay, wtStore: wtStore,
  };
})();
