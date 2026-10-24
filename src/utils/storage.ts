const KEY = 'reflow-404-save-v1';

export interface SaveData {
  soundOn: boolean;
  bestTime: number | null;
  bestEdits: number | null;
  runs: number;
}

const DEFAULTS: SaveData = { soundOn: true, bestTime: null, bestEdits: null, runs: 0 };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function updateSave(patch: Partial<SaveData>): SaveData {
  const next = { ...loadSave(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 隐私模式静默降级 */
  }
  return next;
}
