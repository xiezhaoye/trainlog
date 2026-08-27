-- Development user and starter action library. This migration is deliberately
-- separate so production will receive no demo user when D1 is first created.
INSERT OR IGNORE INTO users (id, email, display_name, created_at, updated_at)
VALUES ('local-dev-user', 'local@trainlog.life', 'Local Developer', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO action_library (user_id, library_json, updated_at) VALUES (
  'local-dev-user',
  '[{"name":"肩","actions":["哑铃侧平举","史密斯机推举","器械侧平举","杠铃片前平举"]},{"name":"背","actions":["引体向上辅助","宽距下拉","坐姿划船","哑铃划船","悍马机大剪刀","悍马机划船"]},{"name":"胸","actions":["器械上斜卧推","器械坐推","器械坐夹胸","哑铃卧推"]},{"name":"臂","actions":["哑铃二头弯举","杠铃二头弯举","哑铃臂屈伸","绳索臂屈伸"]},{"name":"臀腿","actions":["悍马机外展","壶铃甩","坐姿髋外展","坐姿髋内收","器械驴踢","深蹲","单腿深蹲"]},{"name":"核心","actions":["哑铃体侧屈","绳索前推","跪姿卷腹","悍马机卷腹","绳索上下转体","绳索十字转体","蝴蝶收腹","空中单车"]}]',
  datetime('now')
);
