-- Local-only demo data. Values are copied from the confirmed V2 prototype,
-- and this file is intentionally excluded from D1 migrations.
INSERT OR IGNORE INTO users (id, email, display_name, created_at, updated_at)
VALUES ('local-dev-user', 'local@trainlog.life', 'Local Developer', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO action_library (user_id, library_json, updated_at) VALUES (
  'local-dev-user',
  '[{"name":"肩","actions":["哑铃侧平举","史密斯机推举","器械侧平举","杠铃片前平举"]},{"name":"背","actions":["引体向上辅助","宽距下拉","坐姿划船","哑铃划船","悍马机大剪刀","悍马机划船"]},{"name":"胸","actions":["器械上斜卧推","器械坐推","器械坐夹胸","哑铃卧推"]},{"name":"臂","actions":["哑铃二头弯举","杠铃二头弯举","哑铃臂屈伸","绳索臂屈伸"]},{"name":"臀腿","actions":["悍马机外展","壶铃甩","坐姿髋外展","坐姿髋内收","器械驴踢","深蹲","单腿深蹲"]},{"name":"核心","actions":["哑铃体侧屈","绳索前推","跪姿卷腹","悍马机卷腹","绳索上下转体","绳索十字转体","蝴蝶收腹","空中单车"]}]',
  datetime('now')
);

INSERT OR IGNORE INTO templates (id, user_id, type, name, resistance_parts, resistance_exercises, created_at, updated_at) VALUES
  ('v2-chest', 'local-dev-user', 'resistance', '胸日', '["胸"]', '[{"name":"器械上斜卧推","part":"胸","sets":[{"weight_kg":40,"is_bodyweight":false,"reps":10},{"weight_kg":40,"is_bodyweight":false,"reps":8}]},{"name":"器械坐夹胸","part":"胸","sets":[{"weight_kg":35,"is_bodyweight":false,"reps":10}]}]', datetime('now'), datetime('now')),
  ('v2-back', 'local-dev-user', 'resistance', '背日', '["背"]', '[{"name":"坐姿划船","part":"背","sets":[{"weight_kg":50,"is_bodyweight":false,"reps":10}]},{"name":"宽距下拉","part":"背","sets":[{"weight_kg":40,"is_bodyweight":false,"reps":10}]}]', datetime('now'), datetime('now')),
  ('v2-leg', 'local-dev-user', 'resistance', '臀腿日', '["臀腿"]', '[{"name":"深蹲","part":"臀腿","sets":[{"weight_kg":60,"is_bodyweight":false,"reps":10}]},{"name":"坐姿髋外展","part":"臀腿","sets":[{"weight_kg":45,"is_bodyweight":false,"reps":12}]}]', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO templates (id, user_id, type, name, cardio_action, cardio_speed, cardio_duration, created_at, updated_at)
VALUES ('v2-run', 'local-dev-user', 'cardio', '有氧', '跑步机慢跑', 7.5, 30, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO weekly_plan_versions (user_id, effective_from, plan_json, updated_at)
VALUES ('local-dev-user', '1970-01-01', '{"mon":["v2-chest"],"tue":["v2-run"],"wed":["v2-back"],"thu":["v2-leg"],"fri":["v2-chest"],"sat":[],"sun":[]}', datetime('now'));

INSERT OR IGNORE INTO records (id, user_id, date, type, template_name, resistance_exercises, duration_minutes, completed, mood, session, created_at, updated_at)
VALUES (
  'v2-today-session', 'local-dev-user', date('now', '+8 hours'), 'resistance', '今日训练',
  '[{"id":"v2-side-raise","type":"resistance","part":"肩","name":"哑铃侧平举","done":true,"notes":"三角中束很涨","sets":[{"weight_kg":8,"is_bodyweight":false,"reps":12,"done":true},{"weight_kg":8,"is_bodyweight":false,"reps":12,"done":true},{"weight_kg":6,"is_bodyweight":false,"reps":14,"done":true}]},{"id":"v2-bike","type":"resistance","part":"核心","name":"空中单车","done":true,"notes":"","sets":[{"weight_kg":null,"is_bodyweight":true,"reps":20,"done":true},{"weight_kg":null,"is_bodyweight":true,"reps":20,"done":true}]},{"id":"v2-row","type":"resistance","part":"背","name":"坐姿划船","done":false,"notes":"","sets":[]},{"id":"v2-run-action","type":"cardio","part":"有氧","name":"跑步机慢跑","done":false,"notes":"","duration":30,"sets":[]}]',
  60, 0, NULL, 1, datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO records (id, user_id, date, type, template_id, template_name, resistance_exercises, duration_minutes, completed, session, created_at, updated_at)
VALUES ('v2-history-chest', 'local-dev-user', date('now', '+8 hours', '-2 days'), 'resistance', 'v2-chest', '胸日', '[{"name":"器械上斜卧推","part":"胸","sets":[{"weight_kg":40,"is_bodyweight":false,"reps":10,"done":true},{"weight_kg":42,"is_bodyweight":false,"reps":8,"done":true}]},{"name":"器械坐夹胸","part":"胸","sets":[{"weight_kg":35,"is_bodyweight":false,"reps":10,"done":true}]}]', 48, 1, 0, datetime('now', '-2 days'), datetime('now', '-2 days'));

INSERT OR IGNORE INTO records (id, user_id, date, type, template_id, template_name, cardio_action, cardio_speed, cardio_duration, duration_minutes, completed, session, created_at, updated_at)
VALUES ('v2-history-run', 'local-dev-user', date('now', '+8 hours', '-1 day'), 'cardio', 'v2-run', '有氧', '跑步机慢跑', 7.5, 30, 30, 1, 0, datetime('now', '-1 day'), datetime('now', '-1 day'));
