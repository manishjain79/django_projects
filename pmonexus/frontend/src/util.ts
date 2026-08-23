import type { Calendar, FlatRow, Predecessor, Task } from './types';

export const D = (iso: string | null): Date | null => (iso ? new Date(iso + 'T00:00:00') : null);
export const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d: Date, n: number): Date => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const diffDays = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / 86400000);
const isoDow = (d: Date): number => (d.getDay() === 0 ? 7 : d.getDay());

export function makeWorkday(cal: Calendar) {
  const holidays = new Set(cal.holidays.map(h => h.date));
  const isWork = (d: Date) => cal.working_days.includes(isoDow(d)) && !holidays.has(iso(d));
  const isHoliday = (d: Date) => holidays.has(iso(d));
  const shift = (d: Date, n: number): Date => {
    let x = new Date(d);
    const fwd = n >= 0;
    while (!isWork(x)) x = addDays(x, fwd ? 1 : -1);
    for (let i = 0; i < Math.abs(n); i++) {
      x = addDays(x, fwd ? 1 : -1);
      while (!isWork(x)) x = addDays(x, fwd ? 1 : -1);
    }
    return x;
  };
  const count = (a: Date | null, b: Date | null): number => {
    if (!a || !b || b < a) return 0;
    let n = 0; let d = new Date(a);
    while (d <= b) { if (isWork(d)) n++; d = addDays(d, 1); }
    return Math.max(1, n);
  };
  const addWork = (start: Date, n: number) => shift(start, Math.max(1, n) - 1);
  const startForEnd = (end: Date, dur: number) => shift(end, -(Math.max(1, dur) - 1));
  return { isWork, isHoliday, shift, count, addWork, startForEnd };
}

export type SortMode = 'outline' | 'name' | 'start' | 'duration';

/** Comparator for a chosen sort mode. `outline` preserves the manual/plan order. */
function sortComparator(mode: SortMode): ((a: Task, b: Task) => number) | undefined {
  if (mode === 'name') return (a, b) => a.title.localeCompare(b.title);
  if (mode === 'start') return (a, b) => (a.start || '9999').localeCompare(b.start || '9999');
  if (mode === 'duration') {
    const span = (t: Task) => (t.start && t.end ? diffDays(D(t.start)!, D(t.end)!) : 0);
    return (a, b) => span(b) - span(a);
  }
  return undefined; // outline
}

export function childrenOf(tasks: Task[], parentId: number | null, cmp?: (a: Task, b: Task) => number): Task[] {
  const list = tasks.filter(t => t.parent_id === parentId);
  if (cmp) return list.sort((a, b) => cmp(a, b) || a.sort_order - b.sort_order || a.id - b.id);
  return list.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

export interface BuildOpts {
  cal?: Calendar;              // enables duration-weighted % roll-up (MS Project behaviour)
  sortMode?: SortMode;         // non-destructive display ordering; defaults to outline/manual
}

/**
 * Flattens the task tree for display.
 *  - Summary %complete is DURATION-WEIGHTED from its descendants (like MS Project),
 *    so "based on the tasks completed" rather than a naive average.
 *  - Sorting is a *view* concern (does not mutate saved sort_order), and defaults
 *    to the manual outline order — never alphabetical.
 */
export function buildFlat(tasks: Task[], collapsed: Set<number>, opts: BuildOpts = {}): FlatRow[] {
  const flat: FlatRow[] = [];
  const cmp = sortComparator(opts.sortMode || 'outline');
  const wd = opts.cal ? makeWorkday(opts.cal) : null;
  const dur = (s: string | null, e: string | null): number => {
    if (!s || !e) return 1;
    return wd ? wd.count(D(s), D(e)) : Math.max(1, diffDays(D(s)!, D(e)!) + 1);
  };
  const rollup = (t: Task): { start: string | null; end: string | null; progress: number; isSummary: boolean } => {
    const kids = childrenOf(tasks, t.id, cmp);
    if (!kids.length) return { start: t.start, end: t.end, progress: t.progress, isSummary: false };
    let s: string | null = null, e: string | null = null, weight = 0, weighted = 0;
    for (const k of kids) {
      const r = rollup(k);
      if (r.start && (!s || r.start < s)) s = r.start;
      if (r.end && (!e || r.end > e)) e = r.end;
      const w = dur(r.start, r.end);
      weight += w;
      weighted += r.progress * w;
    }
    return { start: s, end: e, progress: weight ? Math.round(weighted / weight) : 0, isSummary: true };
  };
  const walk = (parentId: number | null, level: number, prefix: string) => {
    childrenOf(tasks, parentId, cmp).forEach((t, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      const r = rollup(t);
      flat.push({ t, level, wbs, row: flat.length, isSummary: r.isSummary, start: r.start, end: r.end, progress: r.progress });
      if (!collapsed.has(t.id)) walk(t.id, level + 1, wbs);
    });
  };
  walk(null, 0, '');
  return flat;
}

export function predText(t: Task, wbsOf: (id: number) => string | null): string {
  return (t.predecessors || [])
    .map(p => {
      const w = wbsOf(p.id);
      if (w === null) return '';
      const lag = p.lag ? (p.lag > 0 ? '+' + p.lag : String(p.lag)) : '';
      const type = p.type === 'FS' && !lag ? '' : p.type;
      return w + type + lag;
    })
    .filter(Boolean)
    .join(',');
}

export function parsePreds(text: string, flat: FlatRow[]): Predecessor[] {
  const out: Predecessor[] = [];
  for (const piece of text.split(/[,;]/)) {
    const m = piece.trim().match(/^([\d.]+)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?d?$/i);
    if (piece.trim() && !m) throw new Error(`Can't read "${piece.trim()}" — use WBS refs like 2, 1.3SS or 2.1FS+3`);
    if (!m) continue;
    const target = flat.find(r => r.wbs === m[1]);
    if (!target) throw new Error(`There's no task with WBS ${m[1]}`);
    out.push({ id: target.t.id, type: (m[2] || 'FS').toUpperCase() as Predecessor['type'], lag: m[3] ? parseInt(m[3], 10) : 0 });
  }
  return out;
}

/** Driving-chain critical path trace (same rules as the server scheduler). */
export function computeCritical(tasks: Task[], cal: Calendar): Set<number> {
  const wd = makeWorkday(cal);
  const critical = new Set<number>();
  const leaf = tasks.filter(t => !tasks.some(x => x.parent_id === t.id) && t.start && t.end);
  if (!leaf.length) return critical;
  const projectEnd = leaf.reduce((m, t) => (t.end! > m ? t.end! : m), leaf[0].end!);
  const byId = new Map(leaf.map(t => [t.id, t]));
  const required = (pred: Task, succ: Task, type: string, lag: number): string => {
    const dur = wd.count(D(succ.start), D(succ.end));
    if (type === 'SS') return iso(wd.shift(D(pred.start!)!, lag));
    if (type === 'FF') return iso(wd.startForEnd(wd.shift(D(pred.end!)!, lag), dur));
    if (type === 'SF') return iso(wd.startForEnd(wd.shift(D(pred.start!)!, lag), dur));
    return iso(wd.shift(D(pred.end!)!, 1 + lag));
  };
  const queue: Task[] = [];
  for (const t of leaf) if (t.end === projectEnd) { critical.add(t.id); queue.push(t); }
  while (queue.length) {
    const succ = queue.pop()!;
    for (const p of succ.predecessors || []) {
      const pred = byId.get(p.id);
      if (!pred || critical.has(pred.id)) continue;
      if (required(pred, succ, p.type, p.lag || 0) === succ.start) { critical.add(pred.id); queue.push(pred); }
    }
  }
  return critical;
}

/**
 * CPM total & free slack (working days) per leaf task. The scheduled start/end
 * are treated as the Early Start/Finish (ASAP scheduling); a backward pass from
 * the project finish (or each task's deadline) yields Late Finish, so
 * Total slack = LF − EF. Free slack is the delay a task can take without
 * moving any successor. Negative total slack = a deadline/constraint breach.
 */
export function computeSlack(tasks: Task[], cal: Calendar): Map<number, { total: number; free: number }> {
  const wd = makeWorkday(cal);
  const result = new Map<number, { total: number; free: number }>();
  const leaf = tasks.filter(t => !tasks.some(x => x.parent_id === t.id) && t.start && t.end);
  if (!leaf.length) return result;
  const byId = new Map(leaf.map(t => [t.id, t]));
  const succ = new Map<number, { id: number; type: string; lag: number }[]>();
  for (const t of leaf) for (const p of (t.predecessors || [])) {
    if (!byId.has(p.id)) continue;
    if (!succ.has(p.id)) succ.set(p.id, []);
    succ.get(p.id)!.push({ id: t.id, type: p.type, lag: p.lag || 0 });
  }
  const projEnd = leaf.reduce((m, t) => (t.end! > m ? t.end! : m), leaf[0].end!);
  const projEndD = D(projEnd)!;
  // signed working-day gap: b later than a → positive (a and b inclusive count − 1)
  const gap = (a: Date, b: Date) => b >= a ? wd.count(a, b) - 1 : -(wd.count(b, a) - 1);

  const order = [...leaf].sort((a, b) => (a.end! < b.end! ? 1 : a.end! > b.end! ? -1 : b.id - a.id));
  const lf = new Map<number, Date>();
  for (const t of order) {
    const dur = wd.count(D(t.start!), D(t.end!));
    let lfD = (t.deadline && D(t.deadline)! < projEndD) ? D(t.deadline)! : projEndD;
    for (const s of (succ.get(t.id) || [])) {
      const sc = byId.get(s.id)!;
      const scLF = lf.get(s.id) ?? projEndD;
      const scDur = wd.count(D(sc.start!), D(sc.end!));
      const scLS = wd.startForEnd(scLF, scDur);
      let cand: Date;
      if (s.type === 'FF') cand = wd.shift(scLF, -s.lag);
      else if (s.type === 'SS') cand = wd.addWork(wd.shift(scLS, -s.lag), dur);
      else if (s.type === 'SF') cand = wd.addWork(wd.shift(scLF, -s.lag), dur);
      else cand = wd.shift(scLS, -(1 + s.lag));   // FS
      if (cand < lfD) lfD = cand;
    }
    lf.set(t.id, lfD);
  }
  for (const t of leaf) {
    const efD = D(t.end!)!;
    const total = gap(efD, lf.get(t.id)!);
    const succs = succ.get(t.id) || [];
    let free = total;
    if (succs.length) {
      free = Infinity;
      for (const s of succs) {
        const sc = byId.get(s.id)!;
        let g: number;
        if (s.type === 'SS') g = gap(D(t.start!)!, D(sc.start!)!) - s.lag;
        else if (s.type === 'FF') g = gap(efD, D(sc.end!)!) - s.lag;
        else g = gap(efD, D(sc.start!)!) - 1 - s.lag;   // FS
        if (g < free) free = g;
      }
      free = Math.max(0, Math.min(free, total));
    }
    result.set(t.id, { total, free });
  }
  return result;
}
