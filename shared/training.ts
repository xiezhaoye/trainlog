export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type DefaultTemplateSeed = {
  key: string;
  type: 'cardio' | 'resistance';
  name: string;
  parts?: string[];
  exercises?: { name: string; part: string; sets: { weight_kg: number | null; is_bodyweight: boolean; reps: number }[] }[];
  cardioAction?: string;
  cardioSpeed?: number;
  cardioDuration?: number;
};

// Copied from the confirmed V2 prototype (myinfo/设计稿/v2/训练模板.html,
// 训练计划.html) so new accounts start with the same sample templates and
// weekly plan instead of an empty state; fully editable/deletable afterward.
export const DEFAULT_TEMPLATES: DefaultTemplateSeed[] = [
  {
    key: 'chest', type: 'resistance', name: '胸日', parts: ['胸'],
    exercises: [
      { name: '器械上斜卧推', part: '胸', sets: [{ weight_kg: 40, is_bodyweight: false, reps: 10 }, { weight_kg: 40, is_bodyweight: false, reps: 8 }] },
      { name: '器械坐夹胸', part: '胸', sets: [{ weight_kg: 35, is_bodyweight: false, reps: 10 }] }
    ]
  },
  {
    key: 'back', type: 'resistance', name: '背日', parts: ['背'],
    exercises: [
      { name: '坐姿划船', part: '背', sets: [{ weight_kg: 50, is_bodyweight: false, reps: 10 }] },
      { name: '宽距下拉', part: '背', sets: [{ weight_kg: 40, is_bodyweight: false, reps: 10 }] }
    ]
  },
  {
    key: 'leg', type: 'resistance', name: '臀腿日', parts: ['臀腿'],
    exercises: [
      { name: '深蹲', part: '臀腿', sets: [{ weight_kg: 60, is_bodyweight: false, reps: 10 }] },
      { name: '坐姿髋外展', part: '臀腿', sets: [{ weight_kg: 45, is_bodyweight: false, reps: 12 }] }
    ]
  },
  { key: 'run', type: 'cardio', name: '有氧', cardioAction: '跑步机慢跑', cardioSpeed: 7.5, cardioDuration: 30 }
];

export const DEFAULT_WEEKLY_PLAN_KEYS: Record<string, string[]> = {
  mon: ['chest'], tue: ['run'], wed: ['back'], thu: ['leg'], fri: ['chest'], sat: [], sun: []
};

export const DEFAULT_ACTION_LIBRARY = [
  { name: '肩', actions: ['哑铃侧平举', '史密斯机推举', '器械侧平举', '杠铃片前平举'] },
  { name: '背', actions: ['引体向上辅助', '宽距下拉', '坐姿划船', '哑铃划船', '悍马机大剪刀', '悍马机划船'] },
  { name: '胸', actions: ['器械上斜卧推', '器械坐推', '器械坐夹胸', '哑铃卧推'] },
  { name: '臂', actions: ['哑铃二头弯举', '杠铃二头弯举', '哑铃臂屈伸', '绳索臂屈伸'] },
  { name: '臀腿', actions: ['悍马机外展', '壶铃甩', '坐姿髋外展', '坐姿髋内收', '器械驴踢', '深蹲', '单腿深蹲'] },
  { name: '核心', actions: ['哑铃体侧屈', '绳索前推', '跪姿卷腹', '悍马机卷腹', '绳索上下转体', '绳索十字转体', '蝴蝶收腹', '空中单车'] }
];

export function normalizeWeeklyPlan(input: unknown) {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return Object.fromEntries(WEEKDAY_KEYS.map((key) => [
    key,
    Array.isArray(source[key]) ? source[key].filter((value): value is string => typeof value === 'string' && Boolean(value)) : []
  ]));
}

export function normalizeActionLibrary(input: unknown) {
  const source = Array.isArray(input) ? input : [];
  const parts = new Set<string>();
  return source.flatMap((item) => {
    const candidate = item && typeof item === 'object' ? item as { name?: unknown; actions?: unknown } : {};
    const name = String(candidate.name || '').trim();
    if (!name || parts.has(name)) return [];
    parts.add(name);
    const actions = Array.isArray(candidate.actions) ? candidate.actions : [];
    const seen = new Set<string>();
    return [{
      name,
      actions: actions.flatMap((action) => {
        const value = String(action || '').trim();
        if (!value || seen.has(value)) return [];
        seen.add(value);
        return [value];
      })
    }];
  });
}
