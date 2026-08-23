/**
 * Local-first store: every mutation applies to local state instantly
 * (optimistic), syncs to the server in the background, and pushes an inverse
 * onto the undo stack. Scheduling-relevant changes trigger a silent refetch so
 * the server's auto-scheduler cascades flow back into the UI.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { makeApi } from './api';
import type { Calendar, PlanData, Task } from './types';
import { D, childrenOf, iso, makeWorkday } from './util';

type Fields = Record<string, unknown>;
type OrderRow = { id: number; sort_order: number; parent_id: number | null };

type Cmd =
  | { kind: 'update'; ops: { id: number; redo: Fields; undo: Fields }[] }
  | { kind: 'create'; payload: Fields; id: number }
  | { kind: 'delete'; snapshot: Task[] }          // parent-first order
  | { kind: 'order'; before: OrderRow[]; after: OrderRow[] };

const SCHED_FIELDS = ['start_date', 'end_date', 'duration', 'predecessors',
  'constraint_type', 'constraint_date', 'is_milestone'];
const schedTouched = (f: Fields) => SCHED_FIELDS.some(k => k in f);

/** Apply a server-vocabulary patch to a local task; returns the inverse patch. */
function localApply(data: PlanData, task: Task, fields: Fields, cal: Calendar): Fields {
  const wd = makeWorkday(cal);
  const undo: Fields = {};
  const before = { ...task };

  if ('title' in fields && (fields.title as string)?.trim()) { undo.title = before.title; task.title = (fields.title as string).trim(); }
  if ('description' in fields) { undo.description = before.description; task.description = (fields.description as string) || ''; }
  if ('status' in fields) {
    undo.status = before.status; undo.progress = before.progress;
    task.status = fields.status as string;
    // Any status in the "Complete" category snaps progress to 100 (custom statuses included).
    const sd = data.statuses?.find(s => s.key === task.status);
    if (sd ? sd.category === 'DONE' : task.status === 'DONE') task.progress = 100;
  }
  if ('progress' in fields) {
    undo.progress = before.progress;
    task.progress = Math.max(0, Math.min(100, parseInt(String(fields.progress), 10) || 0));
  }
  if ('is_milestone' in fields) {
    undo.is_milestone = before.is_milestone; undo.end_date = before.end;
    task.is_milestone = !!fields.is_milestone;
    if (task.is_milestone && task.start) task.end = task.start;
  }
  if ('start_date' in fields || 'end_date' in fields || 'duration' in fields) {
    undo.start_date = before.start; undo.end_date = before.end;
    if ('start_date' in fields && fields.start_date) {
      const ns = wd.shift(D(fields.start_date as string)!, 0);
      if (task.start && task.end && !('end_date' in fields) && !('duration' in fields)) {
        const dur = wd.count(D(task.start), D(task.end));
        task.end = iso(wd.addWork(ns, dur));
      }
      task.start = iso(ns);
    }
    if ('end_date' in fields && fields.end_date) task.end = fields.end_date as string;
    if ('duration' in fields && task.start) {
      const n = Math.max(1, parseInt(String(fields.duration), 10) || 1);
      task.end = iso(wd.addWork(D(task.start)!, n));
    }
  }
  if ('predecessors' in fields) {
    undo.predecessors = before.predecessors;
    task.predecessors = (fields.predecessors as Task['predecessors']) || [];
  }
  if ('parent_id' in fields) { undo.parent_id = before.parent_id; task.parent_id = fields.parent_id as number | null; }
  if ('assignee_id' in fields) {
    undo.assignee_id = before.assignee ? before.assignee.id : null;
    const m = data.members.find(x => x.id === fields.assignee_id);
    task.assignee = m ? { id: m.id, name: m.name } : null;
    task.assignees = m ? [{ id: m.id, name: m.name, units: 1 }] : [];
  }
  if ('assignee_ids' in fields) {
    undo.assignee_ids = (before.assignees || []).map(a => a.id);
    const ids = (fields.assignee_ids as number[]) || [];
    const list = ids
      .map(id => data.members.find(x => x.id === id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map(m => ({ id: m.id, name: m.name, units: 1 }));
    task.assignees = list;
    task.assignee = list.length ? { id: list[0].id, name: list[0].name } : null;
  }
  if ('assignments' in fields) {
    undo.assignments = (before.assignees || []).map(a => ({ user_id: a.id, units: a.units }));
    const list = (fields.assignments as { user_id: number; units: number }[] || [])
      .map(x => { const m = data.members.find(mm => mm.id === x.user_id); return m ? { id: m.id, name: m.name, units: x.units } : null; })
      .filter((x): x is { id: number; name: string; units: number } => !!x);
    task.assignees = list;
    task.assignee = list.length ? { id: list[0].id, name: list[0].name } : null;
  }
  for (const k of ['task_type', 'effort_driven', 'scheduling_mode', 'is_active', 'fixed_cost'] as const) {
    if (k in fields) {
      (undo as Record<string, unknown>)[k] = (before as unknown as Record<string, unknown>)[k];
      (task as unknown as Record<string, unknown>)[k] = fields[k];
    }
  }
  if ('sprint_id' in fields) { undo.sprint_id = before.sprint_id; task.sprint_id = (fields.sprint_id as number | null) ?? null; }
  if ('constraint_type' in fields) {
    undo.constraint_type = before.constraint_type; undo.constraint_date = before.constraint_date;
    task.constraint_type = fields.constraint_type as string;
    if (task.constraint_type === 'ASAP') task.constraint_date = null;
  }
  if ('constraint_date' in fields) { undo.constraint_date = before.constraint_date; task.constraint_date = (fields.constraint_date as string | null) || null; }
  if ('deadline' in fields) { undo.deadline = before.deadline; task.deadline = (fields.deadline as string | null) || null; }
  if ('estimated_hours' in fields) {
    undo.estimated_hours = before.estimated_hours;
    task.estimated_hours = fields.estimated_hours ? parseFloat(String(fields.estimated_hours)) : null;
  }
  if ('story_points' in fields) {
    undo.story_points = before.story_points;
    task.story_points = fields.story_points ? parseInt(String(fields.story_points), 10) : null;
  }
  if ('format' in fields && typeof fields.format === 'object') {
    undo.format = { ...before.format };
    task.format = { ...task.format, ...(fields.format as object) };
  }
  if ('custom_values' in fields && typeof fields.custom_values === 'object') {
    const cv = fields.custom_values as Record<string, string>;
    const beforeVals: Record<string, string> = {};
    for (const k of Object.keys(cv)) beforeVals[k] = before.custom_values[k] ?? '';
    undo.custom_values = beforeVals;
    task.custom_values = { ...task.custom_values, ...cv };
  }
  return undo;
}

export function usePlanStore(projectId: number) {
  const api = useRef(makeApi(projectId)).current;
  const [data, setData] = useState<PlanData | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [historyLen, setHistoryLen] = useState({ undo: 0, redo: 0 });
  const undoStack = useRef<Cmd[]>([]);
  const redoStack = useRef<Cmd[]>([]);
  const refetchTimer = useRef<number | null>(null);

  const say = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const syncHistory = () => setHistoryLen({ undo: undoStack.current.length, redo: redoStack.current.length });

  const refetch = useCallback(async () => {
    try { setData(await api.fetchData()); } catch { say('Lost connection to the server', true); }
  }, [api, say]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) window.clearTimeout(refetchTimer.current);
    refetchTimer.current = window.setTimeout(refetch, 350);
  }, [refetch]);

  useEffect(() => { refetch(); }, [refetch]);

  const push = (cmd: Cmd) => { undoStack.current.push(cmd); if (undoStack.current.length > 60) undoStack.current.shift(); redoStack.current = []; syncHistory(); };

  /** Optimistic bulk field update. */
  const applyUpdate = useCallback((ids: number[], fields: Fields) => {
    setData(prev => {
      if (!prev) return prev;
      const next: PlanData = { ...prev, tasks: prev.tasks.map(t => ({ ...t })) };
      const ops: { id: number; redo: Fields; undo: Fields }[] = [];
      for (const id of ids) {
        const t = next.tasks.find(x => x.id === id);
        if (!t) continue;
        ops.push({ id, redo: fields, undo: localApply(next, t, fields, next.calendar) });
      }
      if (ops.length) push({ kind: 'update', ops });
      (async () => {
        for (const op of ops) { try { await api.updateTask(op.id, op.redo); } catch (e) { say((e as Error).message, true); refetch(); return; } }
        if (schedTouched(fields)) scheduleRefetch();
      })();
      return next;
    });
  }, [api, refetch, say, scheduleRefetch]);

  /** Create then insert (awaits server for the real id — still <100ms locally). */
  const applyCreate = useCallback(async (payload: Fields): Promise<Task | null> => {
    try {
      const res = await api.createTask(payload);
      setData(prev => prev ? { ...prev, tasks: [...prev.tasks, res.task] } : prev);
      push({ kind: 'create', payload, id: res.task.id });
      return res.task;
    } catch (e) { say((e as Error).message, true); return null; }
  }, [api, say]);

  const applyDelete = useCallback((id: number) => {
    setData(prev => {
      if (!prev) return prev;
      const snapshot: Task[] = [];
      const collect = (pid: number) => {
        const t = prev.tasks.find(x => x.id === pid);
        if (t) { snapshot.push({ ...t }); childrenOf(prev.tasks, pid).forEach(c => collect(c.id)); }
      };
      collect(id);
      const gone = new Set(snapshot.map(t => t.id));
      push({ kind: 'delete', snapshot });
      (async () => { try { await api.deleteTask(id); } catch (e) { say((e as Error).message, true); refetch(); } })();
      return { ...prev, tasks: prev.tasks.filter(t => !gone.has(t.id)) };
    });
  }, [api, refetch, say]);

  const applyOrder = useCallback((after: OrderRow[]) => {
    setData(prev => {
      if (!prev) return prev;
      const before: OrderRow[] = prev.tasks.map(t => ({ id: t.id, sort_order: t.sort_order, parent_id: t.parent_id }));
      const next: PlanData = { ...prev, tasks: prev.tasks.map(t => ({ ...t })) };
      for (const row of after) {
        const t = next.tasks.find(x => x.id === row.id);
        if (t) { t.sort_order = row.sort_order; t.parent_id = row.parent_id; }
      }
      push({ kind: 'order', before, after });
      (async () => { try { await api.reorder(after); } catch (e) { say((e as Error).message, true); refetch(); } })();
      return next;
    });
  }, [api, refetch, say]);

  const runInverse = useCallback(async (cmd: Cmd, direction: 'undo' | 'redo') => {
    const fwd = direction === 'redo';
    if (cmd.kind === 'update') {
      setData(prev => {
        if (!prev) return prev;
        const next: PlanData = { ...prev, tasks: prev.tasks.map(t => ({ ...t })) };
        for (const op of cmd.ops) {
          const t = next.tasks.find(x => x.id === op.id);
          if (t) localApply(next, t, fwd ? op.redo : op.undo, next.calendar);
        }
        return next;
      });
      let sched = false;
      for (const op of cmd.ops) {
        const f = fwd ? op.redo : op.undo;
        sched = sched || schedTouched(f);
        try { await api.updateTask(op.id, f); } catch { /* refetch below heals */ }
      }
      if (sched) scheduleRefetch();
    } else if (cmd.kind === 'create') {
      if (!fwd) {
        setData(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== cmd.id) } : prev);
        try { await api.deleteTask(cmd.id); } catch { /* ignore */ }
      } else {
        try {
          const res = await api.createTask(cmd.payload);
          cmd.id = res.task.id;
          setData(prev => prev ? { ...prev, tasks: [...prev.tasks, res.task] } : prev);
        } catch { await refetch(); }
      }
    } else if (cmd.kind === 'delete') {
      if (fwd) {
        const gone = new Set(cmd.snapshot.map(t => t.id));
        setData(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => !gone.has(t.id)) } : prev);
        try { await api.deleteTask(cmd.snapshot[0].id); } catch { /* ignore */ }
      } else {
        // Restore the subtree: recreate parent-first, remapping ids.
        const map = new Map<number, number>();
        for (const old of cmd.snapshot) {
          try {
            const res = await api.createTask({
              title: old.title, description: old.description,
              parent_id: old.parent_id !== null ? (map.get(old.parent_id) ?? old.parent_id) : null,
              start_date: old.start, end_date: old.end, status: old.status,
              is_milestone: old.is_milestone,
              assignee_id: old.assignee ? old.assignee.id : null, sprint_id: old.sprint_id,
            });
            map.set(old.id, res.task.id);
            await api.updateTask(res.task.id, {
              progress: old.progress, format: old.format,
              deadline: old.deadline, estimated_hours: old.estimated_hours, story_points: old.story_points,
            });
          } catch { /* partial restore still healed by refetch */ }
        }
        await refetch();
        // Old ids are gone, so any remaining history would point at ghosts.
        undoStack.current = []; redoStack.current = []; syncHistory();
        say('Deleted tasks restored — undo history reset');
        return;
      }
    } else if (cmd.kind === 'order') {
      const rows = fwd ? cmd.after : cmd.before;
      setData(prev => {
        if (!prev) return prev;
        const next: PlanData = { ...prev, tasks: prev.tasks.map(t => ({ ...t })) };
        for (const row of rows) {
          const t = next.tasks.find(x => x.id === row.id);
          if (t) { t.sort_order = row.sort_order; t.parent_id = row.parent_id; }
        }
        return next;
      });
      try { await api.reorder(rows); } catch { await refetch(); }
    }
  }, [api, refetch, say, scheduleRefetch]);

  const undo = useCallback(async () => {
    const cmd = undoStack.current.pop();
    if (!cmd) return;
    redoStack.current.push(cmd); syncHistory();
    await runInverse(cmd, 'undo');
  }, [runInverse]);

  const redo = useCallback(async () => {
    const cmd = redoStack.current.pop();
    if (!cmd) return;
    undoStack.current.push(cmd); syncHistory();
    await runInverse(cmd, 'redo');
  }, [runInverse]);

  return {
    api, data, setData, toast, say, refetch,
    applyUpdate, applyCreate, applyDelete, applyOrder,
    undo, redo, canUndo: historyLen.undo > 0, canRedo: historyLen.redo > 0,
  };
}
export type Store = ReturnType<typeof usePlanStore>;
