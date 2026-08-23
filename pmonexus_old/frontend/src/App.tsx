import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, ArrowDownAZ, BarChart3, Bold, CalendarClock, CalendarDays, ChevronsDownUp,
  ChevronsUpDown, Columns3, Copy, Diamond, Eye, FileCode2, FileDown, FilePlus2, FileUp, Filter, Flame,
  FileText, FolderOpen, FolderPlus, GanttChart, GitCompare, History, Home, Image, Indent, Info, Italic, Kanban, Layers, Link2,
  DollarSign, ListPlus, Maximize2, Monitor, Outdent, PanelBottom, PieChart, Plus, Printer, Redo2, Rocket, Save, SlidersHorizontal, Sparkles,
  ShieldAlert, SplitSquareHorizontal, Table2, Tags, Timer, Trash2, Undo2, Unlink, UserPlus,
  Users, Wifi, Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Drawer } from './Drawer';
import { Gantt } from './Gantt';
import { Grid, type ColDef } from './Grid';
import { usePlanStore } from './store';
import type { CondRule, FlatRow, ResourceTimeOffT, StatusCategory, StatusDef, Task } from './types';
import { addDays, D, buildFlat, childrenOf, computeCritical, diffDays, iso, makeWorkday, type SortMode } from './util';

export interface AppConfig {
  projectId: number;
  currentUser?: { id: number; name: string };
  statuses: [string, string][];
  urls: {
    board: string; network: string; raid: string; timelog: string; exportExcel: string; classic: string;
    dashboard: string; projects: string; portfolios: string; team: string; raidOverview: string;
    projectsJson: string; projectCreate: string; exportMsp?: string; presence?: string;
  };
}

const BASE_COLS: ColDef[] = [
  { key: 'wbs', label: 'WBS', w: 64, fixed: true },
  { key: 'name', label: 'Task Name', w: 260, fixed: true },
  { key: 'dur', label: 'Duration', w: 72 },
  { key: 'start', label: 'Start Date', w: 110 },
  { key: 'end', label: 'End Date', w: 110 },
  { key: 'pred', label: 'Predecessor', w: 110 },
  { key: 'resource', label: 'Assigned', w: 150 },
  { key: 'progress', label: 'Progress', w: 74 },
  { key: 'status', label: 'Status', w: 104 },
  { key: 'sprint', label: 'Sprint', w: 110 },
  { key: 'points', label: 'Points', w: 58 },
  { key: 'description', label: 'Description', w: 180 },
  { key: 'deadline', label: 'Deadline', w: 110 },
  { key: 'work', label: 'Work (h)', w: 70 },
  { key: 'baseline_start', label: 'Baseline Start', w: 110 },
  { key: 'baseline_end', label: 'Baseline Finish', w: 110 },
];
const DEFAULT_HIDDEN = ['sprint', 'points', 'description', 'deadline', 'work', 'baseline_start', 'baseline_end'];
const COLORS = ['#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#0f766e'];
const BGS = ['#fef9c3', '#dcfce7', '#dbeafe', '#fce7f3', '#fee2e2', '#ede9fe', '#f1f5f9'];
const DOW: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const TABS = ['project', 'task', 'view', 'format', 'agile', 'report', 'team', 'window'] as const;
type Tab = typeof TABS[number];
type ViewMode = 'split' | 'sheet' | 'chart' | 'resources' | 'usage' | 'workload' | 'baseline' | 'cost' | 'agile';
type ShowFilter = 'all' | 'tasks' | 'milestones';
interface SavedView {
  name: string; viewMode: ViewMode; hiddenCols: string[]; colOrder: string[];
  dayWidth: number; sortMode: SortMode; showFilter: ShowFilter; showCritical: boolean;
}
interface Collaborator { id: number; name: string; editing?: boolean; you?: boolean; }

function Big({ icon: I, label, onClick, disabled, on, title }: {
  icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; on?: boolean; title?: string;
}) {
  return (
    <button className={'rb-big' + (on ? ' on' : '')} disabled={disabled} title={title || label} onClick={onClick}>
      <I size={18} strokeWidth={1.75} /><span>{label}</span>
    </button>
  );
}
function BigLink({ icon: I, label, href, title }: { icon: LucideIcon; label: string; href: string; title?: string }) {
  return (
    <a className="rb-big" href={href} title={title || label}>
      <I size={18} strokeWidth={1.75} /><span>{label}</span>
    </a>
  );
}
function Sm({ icon: I, label, onClick, disabled, on, title }: {
  icon?: LucideIcon; label?: React.ReactNode; onClick?: () => void; disabled?: boolean; on?: boolean; title?: string;
}) {
  return (
    <button className={'rb-sm' + (on ? ' on' : '')} disabled={disabled} title={title} onClick={onClick}>
      {I && <I size={14} strokeWidth={2} />}{label}
    </button>
  );
}

export function App({ cfg }: { cfg: AppConfig }) {
  const store = usePlanStore(cfg.projectId);
  const data = store.data;

  const [tab, setTab] = useState<Tab>('task');
  const fileOpen = false;   // File backstage removed — navigation lives on the top bar, file ops on the Report tab
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [dayWidth, setDayWidth] = useState(24);
  const [showCritical, setShowCritical] = useState(false);
  const [critColor, setCritColor] = useState(() => localStorage.getItem('pmo-critcolor') || '#dc2626');
  const [filterRowOn, setFilterRowOn] = useState(() => localStorage.getItem('pmo-filterrow') !== '0');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  useEffect(() => { localStorage.setItem('pmo-filterrow', filterRowOn ? '1' : '0'); }, [filterRowOn]);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(`pmo-view-${cfg.projectId}`) as ViewMode) || 'split');
  const [gridPct, setGridPct] = useState<number>(() => parseFloat(localStorage.getItem(`pmo-split-${cfg.projectId}`) || '50'));
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    () => JSON.parse(localStorage.getItem(`pmo-colw-${cfg.projectId}`) || '{}'));
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem(`pmo-hidden-${cfg.projectId}`) || JSON.stringify(DEFAULT_HIDDEN))));
  const [colOrder, setColOrder] = useState<string[]>(
    () => JSON.parse(localStorage.getItem(`pmo-colorder-${cfg.projectId}`) || '[]'));
  const [colAlign, setColAlign] = useState<Record<string, 'left' | 'center' | 'right'>>(
    () => JSON.parse(localStorage.getItem(`pmo-colalign-${cfg.projectId}`) || '{}'));
  const [alignCol, setAlignCol] = useState('name');
  const [selectedCol, setSelectedCol] = useState<string | null>(null);   // whole-column selection (click a header)
  const [colMenu, setColMenu] = useState<{ x: number; y: number; key: string } | null>(null);
  const [condFormat, setCondFormat] = useState(() => localStorage.getItem(`pmo-cond-${cfg.projectId}`) === '1');
  const [condRules, setCondRules] = useState<CondRule[]>(() => JSON.parse(localStorage.getItem(`pmo-condrules-${cfg.projectId}`) || '[]'));
  const [condMgrOpen, setCondMgrOpen] = useState(false);
  useEffect(() => { localStorage.setItem(`pmo-colalign-${cfg.projectId}`, JSON.stringify(colAlign)); }, [colAlign, cfg.projectId]);
  useEffect(() => { localStorage.setItem(`pmo-cond-${cfg.projectId}`, condFormat ? '1' : '0'); }, [condFormat, cfg.projectId]);
  useEffect(() => { localStorage.setItem(`pmo-condrules-${cfg.projectId}`, JSON.stringify(condRules)); }, [condRules, cfg.projectId]);
  const [colMgrOpen, setColMgrOpen] = useState(false);
  const [newField, setNewField] = useState<{ name: string; type: string; options: string }>({ name: '', type: 'TEXT', options: '' });
  const [calOpen, setCalOpen] = useState(false);
  const [calDraft, setCalDraft] = useState<{ working_days: number[]; holidays: { name: string; date: string }[] } | null>(null);
  const [assignTo, setAssignTo] = useState('');
  const [sprintTo, setSprintTo] = useState('');
  const [burndownSprint, setBurndownSprint] = useState<number | null>(null);
  const [statusMgrOpen, setStatusMgrOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<StatusDef[] | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: number } | null>(null);
  const [baselineMgrOpen, setBaselineMgrOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [baselineId, setBaselineId] = useState<number | null>(null);   // which baseline to compare against
  const [inspectorOn, setInspectorOn] = useState(() => localStorage.getItem('pmo-inspector') === '1');
  useEffect(() => { localStorage.setItem('pmo-inspector', inspectorOn ? '1' : '0'); }, [inspectorOn]);
  const [capacityMgrOpen, setCapacityMgrOpen] = useState(false);
  const [capacityDraft, setCapacityDraft] = useState<{ id: number; name: string; units: number; rate: number; working_days: number[] | null; time_off: ResourceTimeOffT[] }[] | null>(null);
  // Tasks always display in manual outline order (sorting UI removed by request).
  const sortMode: SortMode = 'outline';
  const [showFilter, setShowFilter] = useState<ShowFilter>('all'); // All / Tasks only / Milestones only
  const [printOpen, setPrintOpen] = useState(false);
  const [printOpts, setPrintOpts] = useState({ scope: 'both' as 'both' | 'sheet' | 'chart', orientation: 'landscape' as 'landscape' | 'portrait', fit: true });
  const [savedViews, setSavedViews] = useState<SavedView[]>(
    () => JSON.parse(localStorage.getItem(`pmo-views-${cfg.projectId}`) || '[]'));
  // Real-time collaboration (live sync + presence). Polls presence/data on an interval.
  const [live, setLive] = useState(() => localStorage.getItem(`pmo-live-${cfg.projectId}`) !== '0');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const revRef = useRef<string>('');
  useEffect(() => { localStorage.setItem(`pmo-live-${cfg.projectId}`, live ? '1' : '0'); }, [live, cfg.projectId]);
  useEffect(() => { localStorage.setItem(`pmo-views-${cfg.projectId}`, JSON.stringify(savedViews)); }, [savedViews, cfg.projectId]);
  const editorRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const todayXRef = useRef(0);
  const xOfRef = useRef<(id: number) => number | null>(() => null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mspRef = useRef<HTMLInputElement>(null);

  const flat: FlatRow[] = useMemo(
    () => (data ? buildFlat(data.tasks, collapsed, { cal: data.calendar, sortMode }) : []),
    [data, collapsed, sortMode]);
  // Display list after the Task/Milestone filter (rows renumbered so grid & Gantt stay in sync).
  const viewFlat: FlatRow[] = useMemo(() => {
    let rows = flat;
    if (showFilter === 'milestones') rows = rows.filter(r => r.t.is_milestone);
    else if (showFilter === 'tasks') rows = rows.filter(r => !r.t.is_milestone);
    return rows === flat ? flat : rows.map((r, i) => ({ ...r, row: i }));
  }, [flat, showFilter]);
  const selRows = useMemo(() => flat.filter(r => selectedIds.has(r.t.id)), [flat, selectedIds]);
  const primary = primaryId !== null ? flat.find(r => r.t.id === primaryId) ?? null : null;
  const selIdList = selRows.map(r => r.t.id);
  const any = selRows.length > 0;

  const cols: ColDef[] = useMemo(() => {
    const all: ColDef[] = [...BASE_COLS];
    for (const f of data?.custom_fields ?? []) all.push({ key: 'cf_' + f.id, label: f.name, w: 120, custom: f });
    const byKey = new Map(all.map(c => [c.key, c]));
    const middleKeys = all.map(c => c.key).filter(k => k !== 'wbs');
    const ordered = [
      ...colOrder.filter(k => byKey.has(k) && k !== 'wbs'),
      ...middleKeys.filter(k => !colOrder.includes(k)),
    ];
    const result = [byKey.get('wbs')!, ...ordered.map(k => byKey.get(k)!)];
    result.push({ key: 'actions', label: '', w: 52, fixed: true });
    const agileCols = (data?.project?.methodology || 'TRADITIONAL') !== 'TRADITIONAL';
    return result.filter(c => !hiddenCols.has(c.key) && (agileCols || (c.key !== 'sprint' && c.key !== 'points')));
  }, [data?.custom_fields, data?.project?.methodology, hiddenCols, colOrder]);

  useEffect(() => { localStorage.setItem(`pmo-colw-${cfg.projectId}`, JSON.stringify(colWidths)); }, [colWidths, cfg.projectId]);
  useEffect(() => { localStorage.setItem(`pmo-hidden-${cfg.projectId}`, JSON.stringify([...hiddenCols])); }, [hiddenCols, cfg.projectId]);
  useEffect(() => { localStorage.setItem(`pmo-view-${cfg.projectId}`, viewMode); }, [viewMode, cfg.projectId]);
  useEffect(() => { localStorage.setItem(`pmo-split-${cfg.projectId}`, String(gridPct)); }, [gridPct, cfg.projectId]);
  useEffect(() => { localStorage.setItem(`pmo-colorder-${cfg.projectId}`, JSON.stringify(colOrder)); }, [colOrder, cfg.projectId]);
  useEffect(() => { localStorage.setItem('pmo-critcolor', critColor); }, [critColor]);

  // Real-time collaboration: heartbeat + presence poll. When someone else's edit
  // changes the plan revision, we silently refetch so their change appears live —
  // no websocket infra required (works on the current Azure App Service host).
  const refetch = store.refetch;
  useEffect(() => {
    const url = cfg.urls.presence;
    if (!url || !live) { setCollaborators([]); return; }
    let alive = true;
    const csrf = (document.cookie.match('(^|;)\\s*csrftoken\\s*=\\s*([^;]+)') || []).pop() || '';
    const ping = async (leaving = false) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
          body: JSON.stringify({ leaving }),
          keepalive: leaving,
        });
        if (!res.ok || leaving) return;
        const d = await res.json();
        if (!alive) return;
        setCollaborators(d.collaborators || []);
        setLastSync(new Date());
        if (d.revision && d.revision !== revRef.current) {
          if (revRef.current) refetch();   // skip the first tick — initial load is already fresh
          revRef.current = d.revision;
        }
      } catch { /* transient network blip; next tick heals */ }
    };
    ping();
    const iv = window.setInterval(ping, 5000);
    const onVis = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearInterval(iv); document.removeEventListener('visibilitychange', onVis); ping(true); };
  }, [cfg.urls.presence, live, refetch]);

  const reorderCols = useCallback((fromKey: string, toKey: string) => {
    setColOrder(() => {
      const current = cols.map(c => c.key).filter(k => k !== 'wbs' && k !== 'actions');
      const fi = current.indexOf(fromKey), ti = current.indexOf(toKey);
      if (fi < 0 || ti < 0) return current;
      current.splice(fi, 1);
      current.splice(ti, 0, fromKey);
      return current;
    });
  }, [cols]);

  const addColumn = useCallback(() => setColMgrOpen(true), []);
  const createField = useCallback(async () => {
    const name = newField.name.trim();
    if (!name) { store.say('Give the column a name', true); return; }
    const options = newField.type === 'SELECT'
      ? newField.options.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    if (newField.type === 'SELECT' && (!options || !options.length)) { store.say('Add at least one choice (comma-separated)', true); return; }
    try {
      const r = await store.api.createField(name, newField.type, options);
      setHiddenCols(prev => { const n = new Set(prev); n.delete('cf_' + r.id); return n; });
      setNewField({ name: '', type: 'TEXT', options: '' });
      store.refetch();
      store.say(`Column "${name}" added`);
    } catch (e) { store.say((e as Error).message, true); }
  }, [store, newField]);

  const onSelect = useCallback((id: number, e: React.MouseEvent) => {
    setSelectedIds(prev => {
      if (e.shiftKey && primaryId !== null) {
        const a = flat.findIndex(r => r.t.id === primaryId), b = flat.findIndex(r => r.t.id === id);
        if (a >= 0 && b >= 0) return new Set(flat.slice(Math.min(a, b), Math.max(a, b) + 1).map(r => r.t.id));
      }
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }
      return new Set([id]);
    });
    setPrimaryId(id);
  }, [flat, primaryId]);

  const addTask = useCallback(async (afterId?: number) => {
    const after = afterId != null ? flat.find(r => r.t.id === afterId)?.t : flat[flat.length - 1]?.t;
    const payload: Record<string, unknown> = {};
    if (after) {
      payload.after_id = after.id;
      payload.parent_id = after.parent_id;
      if (after.start) { payload.start_date = after.start; payload.end_date = after.start; }
    }
    const t = await store.applyCreate(payload);
    if (t) { setSelectedIds(new Set([t.id])); setPrimaryId(t.id); }
  }, [flat, store]);

  const reorderFromTasks = useCallback((tasks: Task[]) => {
    const ordered: { id: number; sort_order: number; parent_id: number | null }[] = [];
    const walk = (pid: number | null) => {
      childrenOf(tasks, pid).forEach(t => { ordered.push({ id: t.id, sort_order: ordered.length + 1, parent_id: t.parent_id }); walk(t.id); });
    };
    walk(null);
    store.applyOrder(ordered);
  }, [store]);

  const indent = useCallback((id: number) => {
    if (!data) return;
    const r = flat.find(x => x.t.id === id);
    if (!r) return;
    for (let i = r.row - 1; i >= 0; i--) {
      const cand = flat[i];
      if (cand.t.parent_id === r.t.parent_id && cand.t.id !== id) {
        setCollapsed(prev => { const n = new Set(prev); n.delete(cand.t.id); return n; });
        reorderFromTasks(data.tasks.map(t => (t.id === id ? { ...t, parent_id: cand.t.id } : t)));
        return;
      }
      if (cand.level < r.level) break;
    }
    store.say('Nothing above to indent under', true);
  }, [data, flat, store, reorderFromTasks]);

  const outdent = useCallback((id: number) => {
    if (!data) return;
    const t = data.tasks.find(x => x.id === id);
    if (!t || t.parent_id === null) { store.say('Already at the top level', true); return; }
    const parent = data.tasks.find(x => x.id === t.parent_id);
    reorderFromTasks(data.tasks.map(x => (x.id === id ? { ...x, parent_id: parent ? parent.parent_id : null } : x)));
  }, [data, store, reorderFromTasks]);

  const moveTask = useCallback((dir: -1 | 1) => {
    if (!data || !primary) return;
    const siblings = childrenOf(data.tasks, primary.t.parent_id);
    const i = siblings.findIndex(s => s.id === primary.t.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) { store.say('Nowhere to move', true); return; }
    const tasks = data.tasks.map(t => {
      if (t.id === siblings[i].id) return { ...t, sort_order: siblings[j].sort_order };
      if (t.id === siblings[j].id) return { ...t, sort_order: siblings[i].sort_order };
      return t;
    });
    reorderFromTasks(tasks);
  }, [data, primary, store, reorderFromTasks]);

  const insertSummary = useCallback(async () => {
    if (!data || !selRows.length) return;
    const first = selRows[0].t;
    const s = await store.applyCreate({
      title: 'New summary task', parent_id: first.parent_id, after_id: first.id,
      start_date: first.start, end_date: first.start,
    });
    if (!s) return;
    const chosen = new Set(selIdList);
    reorderFromTasks(
      (store.data?.tasks ?? data.tasks).map(t => (chosen.has(t.id) ? { ...t, parent_id: s.id } : t)),
    );
    setSelectedIds(new Set([s.id])); setPrimaryId(s.id);
  }, [data, selRows, selIdList, store, reorderFromTasks]);

  const onDropRow = useCallback((draggedId: number, targetId: number) => {
    if (!data || draggedId === targetId) return;
    const dragged = data.tasks.find(t => t.id === draggedId);
    const target = data.tasks.find(t => t.id === targetId);
    if (!dragged || !target) return;
    let pcheck: typeof target | undefined = target;
    while (pcheck) {
      if (pcheck.id === dragged.id) { store.say("Can't move a task inside itself", true); return; }
      pcheck = data.tasks.find(t => t.id === pcheck!.parent_id!);
    }
    const tasks = data.tasks.map(t => (t.id === draggedId ? { ...t, parent_id: target.parent_id } : t));
    const linear: number[] = [];
    const walk = (pid: number | null) => {
      childrenOf(tasks, pid).forEach(t => { if (t.id !== draggedId) { linear.push(t.id); walk(t.id); } });
    };
    walk(null);
    const idx = linear.indexOf(targetId);
    linear.splice(idx < 0 ? linear.length : idx, 0, draggedId);
    const parentById = new Map(tasks.map(t => [t.id, t.parent_id]));
    store.applyOrder(linear.map((tid, i) => ({ id: tid, sort_order: i + 1, parent_id: parentById.get(tid) ?? null })));
  }, [data, store]);

  const deleteSelection = useCallback(() => {
    if (!selRows.length) return;
    const label = selRows.length === 1 ? `"${selRows[0].t.title}"` : `${selRows.length} selected task(s)`;
    if (!confirm(`Delete ${label} (subtasks included)?`)) return;
    for (const r of selRows) store.applyDelete(r.t.id);
    setSelectedIds(new Set()); setPrimaryId(null);
    if (drawerId && selIdList.includes(drawerId)) setDrawerId(null);
  }, [selRows, store, drawerId, selIdList]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
      if ((e.ctrlKey || e.metaKey) && !typing) {
        if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
        else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); store.redo(); }
      }
      if (e.key === 'Delete' && !typing && selRows.length) { e.preventDefault(); deleteSelection(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [store, selRows, deleteSelection]);

  // Dismiss the right-click context menu on any outside click, scroll or Escape.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [ctxMenu]);

  // A non-Agile project has no Agile tab — leave it if the type changes.
  useEffect(() => {
    const trad = (data?.project?.methodology || 'TRADITIONAL') === 'TRADITIONAL';
    if (trad && tab === 'agile') setTab('task');
    if (trad && viewMode === 'agile') setViewMode('split');
  }, [data?.project?.methodology, tab, viewMode]);

  // Dismiss the column header menu on outside click / scroll.
  useEffect(() => {
    if (!colMenu) return;
    const close = () => setColMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [colMenu]);

  const startSplit = (e: React.PointerEvent) => {
    e.preventDefault();
    const wrap = editorRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const move = (ev: PointerEvent) => setGridPct(Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100)));
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  const exportGanttPng = () => {
    const svg = document.getElementById('gantt-svg') as unknown as SVGSVGElement | null;
    if (!svg) { store.say('Switch to a view that shows the Gantt first', true); return; }
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svg.width.baseVal.value * 2;
      canvas.height = svg.height.baseVal.value * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.download = `${data?.project.name ?? 'project'} - gantt.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  };

  const importExcel = () => {
    if (confirm('Import tasks from .xlsx?\nColumns: Task Name, Duration, Start, Finish, Predecessors, Resource, % Complete (+ WBS/Outline Level for hierarchy).'))
      fileRef.current?.click();
  };

  const zoomEntireProject = () => {
    let min: string | null = null, max: string | null = null;
    for (const r of flat) {
      if (r.start && (!min || r.start < min)) min = r.start;
      if (r.end && (!max || r.end > max)) max = r.end;
    }
    if (!min || !max || !ganttScrollRef.current) return;
    const days = diffDays(D(min)!, D(max)!) + 25;
    const width = ganttScrollRef.current.clientWidth - 40;
    setDayWidth(Math.max(2, Math.min(24, Math.floor(width / days))));
    ganttScrollRef.current.scrollTo({ left: 0 });
  };

  const chainLink = () => {
    if (selRows.length >= 2) {
      for (let i = 1; i < selRows.length; i++) {
        const t = selRows[i].t;
        const preds = (t.predecessors || []).slice();
        if (!preds.some(x => x.id === selRows[i - 1].t.id)) preds.push({ id: selRows[i - 1].t.id, type: 'FS', lag: 0 });
        store.applyUpdate([t.id], { predecessors: preds });
      }
      return;
    }
    const r = selRows[0];
    if (!r || r.row === 0) { store.say('Select 2+ tasks to chain, or one with a task above it', true); return; }
    const above = flat[r.row - 1].t;
    const preds = (r.t.predecessors || []).slice();
    if (!preds.some(x => x.id === above.id)) preds.push({ id: above.id, type: 'FS', lag: 0 });
    store.applyUpdate([r.t.id], { predecessors: preds });
  };

  const saveCurrentView = () => {
    const name = prompt('Save the current layout as a named view (columns, zoom, filter, sort):');
    if (!name?.trim()) return;
    const v: SavedView = {
      name: name.trim(), viewMode, hiddenCols: [...hiddenCols], colOrder,
      dayWidth, sortMode, showFilter, showCritical,
    };
    setSavedViews(prev => [...prev.filter(x => x.name !== v.name), v]);
    store.say(`Custom view "${v.name}" saved`);
  };
  const applyView = (v: SavedView) => {
    setViewMode(v.viewMode); setHiddenCols(new Set(v.hiddenCols)); setColOrder(v.colOrder);
    setDayWidth(v.dayWidth); setShowFilter(v.showFilter); setShowCritical(v.showCritical);
    store.say(`Custom view "${v.name}" applied`);
  };
  const runPrint = () => {
    document.body.dataset.print = printOpts.scope;
    document.body.dataset.printOrient = printOpts.orientation;
    document.body.dataset.printFit = printOpts.fit ? '1' : '0';
    setPrintOpen(false);
    setTimeout(() => window.print(), 200);
  };
  const exportPdf = () => {
    document.body.dataset.print = 'both';
    document.body.dataset.printOrient = 'landscape';
    document.body.dataset.printFit = '1';
    setSaveAsOpen(false);
    store.say('In the print dialog, choose “Save as PDF” as the destination');
    setTimeout(() => window.print(), 300);
  };
  const runLevel = async () => {
    if (!confirm('Auto-level resources?\n\nOverlapping assignments are delayed (never pulled earlier) so nobody is double-booked, while respecting task dependencies, the calendar and each person’s PTO. Tip: save a baseline first so you can compare before/after.')) return;
    try {
      const r = await store.api.levelResources();
      store.say(r.moved
        ? `Leveled — ${r.moved} task(s) rescheduled · finish ${r.finish_shift_days >= 0 ? '+' : ''}${r.finish_shift_days}d`
        : 'Nothing to level — no overallocation found');
      store.refetch();
    } catch (e) { store.say((e as Error).message, true); }
  };

  if (!data) return <div className="planner-loading">Loading plan…</div>;

  const summaryIds = data.tasks.filter(t => data.tasks.some(x => x.parent_id === t.id)).map(t => t.id);
  const collapseAll = () => setCollapsed(new Set(summaryIds));
  const expandAll = () => setCollapsed(new Set());
  const allCollapsed = summaryIds.length > 0 && summaryIds.every(id => collapsed.has(id));

  // Custom statuses (fall back to the config-provided list if the server is old).
  const statusDefs: StatusDef[] = (data.statuses && data.statuses.length)
    ? data.statuses
    : cfg.statuses.map(([key, name]) => ({ key, name, category: 'NOT_STARTED' as StatusCategory, color: '#94a3b8' }));
  const doneKeys = new Set(statusDefs.filter(s => s.category === 'DONE').map(s => s.key));
  const statusColorOf = (key: string) => statusDefs.find(s => s.key === key)?.color;
  const agile = (data.project.methodology || 'TRADITIONAL') !== 'TRADITIONAL';
  const visibleTabs = agile ? TABS : TABS.filter(tb => tb !== 'agile');
  const taskUsers = (tk: Task): number[] =>
    (tk.assignees && tk.assignees.length ? tk.assignees.map(a => a.id) : (tk.assignee ? [tk.assignee.id] : []));
  const taskUserNames = (tk: Task): string =>
    (tk.assignees && tk.assignees.length ? tk.assignees.map(a => a.name) : (tk.assignee ? [tk.assignee.name] : [])).join(', ');

  const leaf = data.tasks.filter(t => !data.tasks.some(x => x.parent_id === t.id));
  const wdCal = makeWorkday(data.calendar);
  const critSet = computeCritical(data.tasks, data.calendar);

  // Column-level filtering (Excel-style): a row shows only if every active
  // column filter substring-matches that column's text.
  const colText = (r: FlatRow, key: string): string => {
    const t = r.t;
    switch (key) {
      case 'name': return t.title;
      case 'start': return r.start ?? '';
      case 'end': return r.end ?? '';
      case 'dur': return r.start && r.end ? String(wdCal.count(D(r.start), D(r.end))) : '';
      case 'resource': return taskUserNames(t);
      case 'status': return statusDefs.find(s => s.key === t.status)?.name ?? t.status;
      case 'progress': return String(r.progress);
      case 'sprint': return data.sprints.find(s => s.id === t.sprint_id)?.name ?? '';
      case 'points': return t.story_points != null ? String(t.story_points) : '';
      case 'description': return t.description ?? '';
      case 'deadline': return t.deadline ?? '';
      case 'pred': return (t.predecessors || []).map(pp => flat.find(x => x.t.id === pp.id)?.wbs).filter(Boolean).join(',');
      default: return key.startsWith('cf_') ? (t.custom_values?.[key.slice(3)] ?? '') : '';
    }
  };
  const activeColFilters = Object.entries(colFilters).filter(([, v]) => v.trim());
  const displayFlat: FlatRow[] = (filterRowOn && activeColFilters.length)
    ? viewFlat.filter(r => activeColFilters.every(([k, v]) => colText(r, k).toLowerCase().includes(v.toLowerCase()))).map((r, i) => ({ ...r, row: i }))
    : viewFlat;

  // Excel-style aggregate for the selected column (shown in the status bar).
  const colAgg = (() => {
    if (!selectedCol) return null;
    const nums: number[] = [];
    for (const r of displayFlat) {
      let v: number | null = null;
      if (selectedCol === 'progress') v = r.progress;
      else if (selectedCol === 'dur') v = r.start && r.end ? wdCal.count(D(r.start), D(r.end)) : null;
      else if (selectedCol === 'work') v = r.t.estimated_hours ?? null;
      else if (selectedCol === 'points') v = r.t.story_points ?? null;
      else if (selectedCol === 'fixed_cost') v = r.t.fixed_cost ?? null;
      else if (selectedCol.startsWith('cf_')) { const x = parseFloat(r.t.custom_values?.[selectedCol.slice(3)] || ''); v = isNaN(x) ? null : x; }
      if (v != null) nums.push(v);
    }
    const sum = nums.length ? nums.reduce((s, n) => s + n, 0) : null;
    return { label: BASE_COLS.find(c => c.key === selectedCol)?.label ?? (data.custom_fields.find(f => 'cf_' + f.id === selectedCol)?.name ?? selectedCol), count: displayFlat.length, sum, avg: sum != null ? sum / nums.length : null };
  })();

  const stats = (() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: leaf.length,
      complete: leaf.filter(t => doneKeys.has(t.status)).length,
      inProgress: leaf.filter(t => statusDefs.find(s => s.key === t.status)?.category === 'IN_PROGRESS').length,
      overdue: leaf.filter(t => t.end && t.end < today && !doneKeys.has(t.status)).length,
      milestones: leaf.filter(t => t.is_milestone).length,
      start: leaf.reduce<string | null>((m, t) => (t.start && (!m || t.start < m) ? t.start : m), null),
      finish: leaf.reduce<string | null>((m, t) => (t.end && (!m || t.end > m) ? t.end : m), null),
      work: leaf.reduce((s, t) => s + (t.estimated_hours || 0), 0),
      logged: Math.round(leaf.reduce((s, t) => s + (t.logged_minutes || 0), 0) / 60 * 10) / 10,
      critical: critSet.size,
      progress: leaf.length ? Math.round(leaf.reduce((s, t) => s + t.progress, 0) / leaf.length) : 0,
    };
  })();

  const resourceRows = data.members.map(m => {
    const mine = leaf.filter(t => taskUsers(t).includes(m.id));
    return {
      member: m, tasks: mine,
      count: mine.length,
      work: mine.reduce((s, t) => s + (t.estimated_hours || 0), 0),
      logged: Math.round(mine.reduce((s, t) => s + (t.logged_minutes || 0), 0) / 60 * 10) / 10,
      overdue: mine.filter(t => t.end && t.end < new Date().toISOString().slice(0, 10) && t.status !== 'DONE').length,
    };
  });
  const unassigned = leaf.filter(t => taskUsers(t).length === 0);

  // ---- Resource workload heatmap: members × weeks, load vs weekly capacity ----
  const heatColor = (ratio: number) =>
    ratio <= 0 ? '#f8fafc' : ratio <= 0.5 ? '#dcfce7' : ratio <= 1 ? '#86efac'
      : ratio <= 1.5 ? '#fde047' : ratio <= 2 ? '#fb923c' : '#ef4444';
  const workload = (() => {
    let min: string | null = null, max: string | null = null;
    for (const t of leaf) {
      if (t.start && (!min || t.start < min)) min = t.start;
      if (t.end && (!max || t.end > max)) max = t.end;
    }
    if (!min || !max) return null;
    const startD = D(min)!, dow = (startD.getDay() + 6) % 7;      // 0 = Monday
    const weekStart = addDays(startD, -dow);
    const endD = D(max)!;
    const weeks: { start: Date; label: string }[] = [];
    for (let d = new Date(weekStart); d <= endD && weeks.length < 80; d = addDays(d, 7)) {
      weeks.push({ start: new Date(d), label: `${d.getDate()}/${d.getMonth() + 1}` });
    }
    const resMap = new Map((data.resources || []).map(r => [r.id, r]));
    const rows = data.members.map(m => {
      const rp = resMap.get(m.id);
      const units = rp?.units ?? 1;
      const offRanges = rp?.time_off ?? [];
      const workDays = rp?.working_days;
      const isOff = (d: Date) => { const k = iso(d); return offRanges.some(o => k >= o.start && k <= o.end); };
      const personWorks = (d: Date) => !workDays || workDays.includes(((d.getDay() + 6) % 7) + 1);
      const mine = leaf.filter(t => taskUsers(t).includes(m.id) && t.start && t.end && !t.is_milestone);
      const cells = weeks.map(w => {
        const ws = w.start, we = addDays(w.start, 6);
        let load = 0;
        for (const t of mine) {
          const s = D(t.start!)!, e = D(t.end!)!;
          const os = s > ws ? s : ws, oe = e < we ? e : we;
          if (oe >= os) load += wdCal.count(os, oe);
        }
        let capDays = 0, offAny = false;
        for (let d = new Date(ws); d <= we; d = addDays(d, 1)) {
          if (!wdCal.isWork(d) || !personWorks(d)) continue;   // project holiday or the person's own day off
          if (isOff(d)) offAny = true;
          else capDays++;
        }
        const cap = capDays * units;
        const ratio = cap > 0 ? load / cap : (load > 0 ? 99 : 0);
        return { load, ratio, pto: cap === 0 && offAny };
      });
      return { member: m, units, cells, over: cells.filter(c => c.ratio > 1).length };
    }).filter(r => r.cells.some(c => c.load > 0) || r.units !== 1 || (resMap.get(r.member.id)?.time_off?.length ?? 0) > 0);
    return { weeks, rows, overCount: rows.filter(r => r.over > 0).length };
  })();

  // ---- Baseline comparison: current vs a saved baseline snapshot ----
  const activeBaseline = data.baselines?.find(b => b.id === baselineId) ?? data.baselines?.[0] ?? null;
  const baselineRows = activeBaseline ? flat.map(r => {
    const snap = activeBaseline.snapshot[String(r.t.id)];
    const bs = snap?.start ?? null, be = snap?.end ?? null;
    const startVar = bs && r.start ? diffDays(D(bs)!, D(r.start)!) : null;   // + = starts later than baseline
    const finishVar = be && r.end ? diffDays(D(be)!, D(r.end)!) : null;      // + = finishes later (slip)
    const durB = bs && be ? wdCal.count(D(bs), D(be)) : null;
    const durC = r.start && r.end ? wdCal.count(D(r.start), D(r.end)) : null;
    const durVar = durB != null && durC != null ? durC - durB : null;
    return { r, bs, be, startVar, finishVar, durVar };
  }) : [];

  // ---- Agile analytics (Jira-style): velocity + burndown + sprint report ----
  const agileData = (() => {
    const sprints = data.sprints.map(s => {
      const tks = leaf.filter(t => t.sprint_id === s.id);
      const doneT = tks.filter(t => doneKeys.has(t.status));
      const committed = tks.reduce((a, t) => a + (t.story_points || 0), 0);
      const completed = doneT.reduce((a, t) => a + (t.story_points || 0), 0);
      const progress = committed ? Math.round(completed / committed * 100) : (tks.length ? Math.round(doneT.length / tks.length * 100) : 0);
      return { sprint: s, tasks: tks.length, done: doneT.length, committed, completed, progress };
    });
    const withPts = sprints.filter(s => s.committed > 0);
    const avgVel = withPts.length ? Math.round(withPts.reduce((a, s) => a + s.completed, 0) / withPts.length) : 0;
    const todayIso = new Date().toISOString().slice(0, 10);
    const bSprint = data.sprints.find(s => s.id === burndownSprint)
      || data.sprints.find(s => s.start && s.end && s.start <= todayIso && s.end >= todayIso)
      || [...data.sprints].reverse().find(s => s.start && s.end)
      || null;
    const burndown: { day: string; ideal: number; remaining: number | null }[] = [];
    if (bSprint && bSprint.start && bSprint.end) {
      const total = sprints.find(x => x.sprint.id === bSprint.id)?.committed || 0;
      const tks = leaf.filter(t => t.sprint_id === bSprint.id);
      const s0 = D(bSprint.start)!, e0 = D(bSprint.end)!;
      const days = Math.max(1, diffDays(s0, e0));
      for (let i = 0; i <= days; i++) {
        const d = addDays(s0, i); const dIso = iso(d);
        const doneBy = tks.filter(t => doneKeys.has(t.status) && t.end && t.end <= dIso).reduce((a, t) => a + (t.story_points || 0), 0);
        burndown.push({ day: `${d.getDate()}/${d.getMonth() + 1}`, ideal: total * (1 - i / days), remaining: dIso <= todayIso ? total - doneBy : null });
      }
    }
    return { sprints, avgVel, bSprint, burndown };
  })();

  const varTxt = (v: number | null) => v == null ? '—' : v === 0 ? 'On plan' : v > 0 ? `+${v}d` : `${v}d`;
  const varCls = (v: number | null) => 'bl-var' + (v == null || v === 0 ? '' : v > 0 ? ' slip' : ' ahead');

  // ---- Cost & Earned Value (EVM) — computed from resource rates + progress ----
  const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const costView = (() => {
    const rateOf = (uid: number) => (data.resources || []).find(r => r.id === uid)?.rate ?? 0;
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayD = D(todayIso);
    const rows = leaf.filter(t => t.is_active !== false).map(t => {
      const wh = t.estimated_hours ?? (t.start && t.end ? wdCal.count(D(t.start), D(t.end)) * 8 : 0);
      const asg = t.assignees && t.assignees.length ? t.assignees : (t.assignee ? [{ id: t.assignee.id, name: t.assignee.name, units: 1 }] : []);
      const rateSum = asg.reduce((s, a) => s + a.units * rateOf(a.id), 0);
      const cost = (t.fixed_cost || 0) + wh * rateSum;
      const ev = cost * (t.progress || 0) / 100;
      const unitsSum = asg.reduce((s, a) => s + a.units, 0);
      const blended = unitsSum ? rateSum / unitsSum : 0;
      const ac = (t.logged_minutes || 0) / 60 * blended + (t.fixed_cost || 0) * (t.progress || 0) / 100;
      let plannedPct = 0;
      if (t.start && t.end) {
        if (t.end < todayIso) plannedPct = 1;
        else if (t.start > todayIso) plannedPct = 0;
        else { const tot = wdCal.count(D(t.start), D(t.end)); const done = wdCal.count(D(t.start), todayD); plannedPct = Math.min(1, done / Math.max(1, tot)); }
      }
      return { t, cost, ev, ac, pv: cost * plannedPct };
    });
    const BAC = rows.reduce((s, r) => s + r.cost, 0);
    const EV = rows.reduce((s, r) => s + r.ev, 0);
    const AC = rows.reduce((s, r) => s + r.ac, 0);
    const PV = rows.reduce((s, r) => s + r.pv, 0);
    return { rows, BAC, EV, AC, PV, CPI: AC ? EV / AC : 0, SPI: PV ? EV / PV : 0 };
  })();

  return (
    <div className="planner">
      <div id="ribbon">
        <div id="ribbon-tabs">
          <span className="rb-brand" title={data.project.name}><GanttChart size={15} strokeWidth={2.2} />PMONexus</span>
          {visibleTabs.map(tb => (
            <button key={tb} className={tab === tb ? 'on' : ''} onClick={() => setTab(tb)}>
              {tb[0].toUpperCase() + tb.slice(1)}
            </button>
          ))}
          <span className="ribbon-history">
            <button title="Undo (Ctrl+Z)" disabled={!store.canUndo} onClick={() => store.undo()}><Undo2 size={15} /></button>
            <button title="Redo (Ctrl+Y)" disabled={!store.canRedo} onClick={() => store.redo()}><Redo2 size={15} /></button>
          </span>
        </div>

        {!fileOpen && tab === 'project' && (
          <div className="ribbon-pane">
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={CalendarDays} label="Calendar" onClick={() => {
                  setCalDraft({ working_days: [...data.calendar.working_days], holidays: data.calendar.holidays.map(h => ({ name: h.name, date: h.date })) });
                  setCalOpen(true);
                }} />
                <Big icon={History} label="Baselines" title="Save &amp; compare named baselines (MS Project multi-baseline)"
                  onClick={() => setBaselineMgrOpen(true)} />
                <Big icon={Info} label="Statistics" onClick={() => setStatsOpen(true)} />
                <Big icon={Tags} label="Statuses" title="Define your own task statuses (name, colour, category)"
                  onClick={() => { setStatusDraft(statusDefs.map(s => ({ ...s }))); setStatusMgrOpen(true); }} />
              </div>
              <div className="rgroup-label">Properties</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <span className="rb-tag">Type</span>
                  <select className="rb-select" style={{ maxWidth: 150 }} value={data.project.methodology || 'TRADITIONAL'}
                    onChange={async e => {
                      try { await store.api.updateProject({ methodology: e.target.value }); store.refetch(); }
                      catch (err) { store.say((err as Error).message, true); }
                    }}>
                    <option value="TRADITIONAL">Waterfall / Gantt</option>
                    <option value="AGILE">Agile</option>
                    <option value="HYBRID">Hybrid</option>
                  </select>
                </div>
                <p className="rgroup-note" style={{ maxWidth: 168 }}>Agile / Hybrid unlocks the Agile tab, sprints &amp; story-point fields.</p>
              </div>
              <div className="rgroup-label">Methodology</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <span className="rb-tag">Show</span>
                  <Sm icon={Filter} label="All" on={showFilter === 'all'} onClick={() => setShowFilter('all')} />
                  <Sm icon={Table2} label="Tasks" on={showFilter === 'tasks'} title="Tasks only — hide milestones" onClick={() => setShowFilter('tasks')} />
                  <Sm icon={Diamond} label="Milestones" on={showFilter === 'milestones'} title="Milestones only" onClick={() => setShowFilter('milestones')} />
                </div>
                <div className="rrow">
                  <Sm icon={ListPlus} label="Custom Field" title="Add a custom column" onClick={addColumn} />
                  <Sm icon={Filter} label="Column filters" on={filterRowOn} title="Show / hide the per-column filter boxes" onClick={() => setFilterRowOn(v => !v)} />
                </div>
              </div>
              <div className="rgroup-label">Filter</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <BigLink icon={Kanban} label="Board" href={cfg.urls.board} />
                <BigLink icon={Workflow} label="Network" href={cfg.urls.network} />
                <BigLink icon={ShieldAlert} label="RAID / Risk" href={cfg.urls.raid} title="Risks, Assumptions, Issues, Dependencies" />
                <BigLink icon={Timer} label="Time Log" href={cfg.urls.timelog} />
              </div>
              <div className="rgroup-label">Project Views</div>
            </div>
          </div>
        )}

        {!fileOpen && tab === 'task' && (
          <div className="ribbon-pane">
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={Plus} label="Task" onClick={() => addTask(primaryId ?? undefined)} />
                <Big icon={Diamond} label="Milestone" disabled={!any}
                  onClick={() => primary && store.applyUpdate(selIdList, { is_milestone: !primary.t.is_milestone })} />
                <Big icon={FolderPlus} label="Summary" disabled={!any} title="Wrap the selected task(s) in a new summary task"
                  onClick={insertSummary} />
                <Big icon={Copy} label="Duplicate" disabled={!any} onClick={async () => {
                  if (!primary) return;
                  const t = primary.t;
                  const nt = await store.applyCreate({
                    title: t.title + ' (copy)', after_id: t.id, parent_id: t.parent_id,
                    start_date: t.start, end_date: t.end, status: t.status, is_milestone: t.is_milestone,
                    assignee_id: t.assignee?.id ?? null, sprint_id: t.sprint_id, description: t.description,
                  });
                  if (nt) { setSelectedIds(new Set([nt.id])); setPrimaryId(nt.id); }
                }} />
                <Big icon={CalendarClock} label="Recurring" title="Create a recurring task series" onClick={() => setRecurringOpen(true)} />
                <Big icon={Trash2} label="Delete" disabled={!any} onClick={deleteSelection} />
              </div>
              <div className="rgroup-label">Insert</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <span className="rb-tag">Mode</span>
                  <Sm label="Auto" disabled={!any} on={(primary?.t.scheduling_mode ?? 'AUTO') === 'AUTO'}
                    title="Auto-scheduled by dependencies" onClick={() => store.applyUpdate(selIdList, { scheduling_mode: 'AUTO' })} />
                  <Sm label="Manual" disabled={!any} on={primary?.t.scheduling_mode === 'MANUAL'}
                    title="Manually scheduled — not moved by dependencies or leveling" onClick={() => store.applyUpdate(selIdList, { scheduling_mode: 'MANUAL' })} />
                </div>
                <div className="rrow">
                  <Sm icon={primary?.t.is_active === false ? Eye : Trash2} label={primary?.t.is_active === false ? 'Activate' : 'Inactivate'} disabled={!any}
                    title="Inactive tasks are what-if — excluded from rollups, scheduling &amp; cost"
                    onClick={() => store.applyUpdate(selIdList, { is_active: primary?.t.is_active === false })} />
                </div>
              </div>
              <div className="rgroup-label">Task Mode</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <span className="rb-tag" title="Summary tasks calculate % automatically (duration-weighted from their subtasks)">% Complete</span>
                  {[0, 25, 50, 75, 100].map(pct => (
                    <Sm key={pct} label={pct + '%'} disabled={!any || !!primary?.isSummary}
                      title={primary?.isSummary ? 'Auto-calculated from subtasks' : `Set ${pct}% on the selected leaf task(s)`}
                      onClick={() => store.applyUpdate(selIdList, { progress: pct })} />
                  ))}
                </div>
                <div className="rrow">
                  <Sm icon={Link2} disabled={!any} title="Link tasks (FS chain)" onClick={chainLink} />
                  <Sm icon={Unlink} disabled={!any} title="Remove all predecessors"
                    onClick={() => store.applyUpdate(selIdList, { predecessors: [] })} />
                  <Sm icon={Outdent} disabled={!any} title="Outdent (Shift+Tab)" onClick={() => selIdList.forEach(outdent)} />
                  <Sm icon={Indent} disabled={!any} title="Indent — make subtask (Tab)" onClick={() => selIdList.forEach(indent)} />
                  <Sm icon={ArrowUp} disabled={!any} title="Move up" onClick={() => moveTask(-1)} />
                  <Sm icon={ArrowDown} disabled={!any} title="Move down" onClick={() => moveTask(1)} />
                </div>
              </div>
              <div className="rgroup-label">Schedule</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={Info} label="Details" disabled={!any} onClick={() => primaryId && setDrawerId(primaryId)} />
              </div>
              <div className="rgroup-label">Properties</div>
            </div>
          </div>
        )}

        {!fileOpen && tab === 'view' && (
          <div className="ribbon-pane">
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={SplitSquareHorizontal} label="Gantt Chart" on={viewMode === 'split'} onClick={() => setViewMode('split')} />
                <Big icon={Table2} label="Task Sheet" on={viewMode === 'sheet'} onClick={() => setViewMode('sheet')} />
                <Big icon={GanttChart} label="Timeline" on={viewMode === 'chart'} onClick={() => setViewMode('chart')} />
                <BigLink icon={Kanban} label="Board" href={cfg.urls.board} />
                <BigLink icon={Workflow} label="Network" href={cfg.urls.network} />
              </div>
              <div className="rgroup-label">Task Views</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={Users} label="Resource Sheet" on={viewMode === 'resources'} onClick={() => setViewMode('resources')} />
                <Big icon={Timer} label="Resource Usage" on={viewMode === 'usage'} onClick={() => setViewMode('usage')} />
                <Big icon={Activity} label="Workload" on={viewMode === 'workload'} title="Resource workload heatmap &amp; overallocation" onClick={() => setViewMode('workload')} />
                <Big icon={SlidersHorizontal} label="Level" title="Auto-level resources to resolve overallocation" onClick={runLevel} />
              </div>
              <div className="rgroup-label">Resource Views</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={GitCompare} label="Baseline" on={viewMode === 'baseline'} title="Compare the current plan against a saved baseline"
                  onClick={() => { if (!data.baselines?.length) setBaselineMgrOpen(true); else setViewMode('baseline'); }} />
                <Big icon={DollarSign} label="Cost / EVM" on={viewMode === 'cost'} title="Cost &amp; earned-value analysis" onClick={() => setViewMode('cost')} />
                <Big icon={PanelBottom} label="Inspector" on={inspectorOn} title="Show the docked task inspector pane" onClick={() => setInspectorOn(v => !v)} />
              </div>
              <div className="rgroup-label">Tracking</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <Sm label="Day" on={dayWidth === 24} onClick={() => setDayWidth(24)} />
                  <Sm label="Week" on={dayWidth === 10} onClick={() => setDayWidth(10)} />
                  <Sm label="Month" on={dayWidth === 5} onClick={() => setDayWidth(5)} />
                </div>
                <div className="rrow">
                  <Sm label="Today" onClick={() => ganttScrollRef.current?.scrollTo({ left: Math.max(0, todayXRef.current - 240), behavior: 'smooth' })} />
                  <Sm icon={Maximize2} label="Fit" title="Zoom the entire project into view" onClick={zoomEntireProject} />
                </div>
              </div>
              <div className="rgroup-label">Zoom</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={ChevronsDownUp} label="Collapse All" on={allCollapsed} title="Collapse every summary task" onClick={collapseAll} />
                <Big icon={ChevronsUpDown} label="Expand All" title="Show every subtask" onClick={expandAll} />
              </div>
              <div className="rgroup-label">Rows</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <span className="rb-tag">Show</span>
                  <Sm icon={Filter} label="All" on={showFilter === 'all'} onClick={() => setShowFilter('all')} />
                  <Sm icon={Table2} label="Tasks" on={showFilter === 'tasks'} title="Tasks only" onClick={() => setShowFilter('tasks')} />
                  <Sm icon={Diamond} label="Milestones" on={showFilter === 'milestones'} title="Milestones only" onClick={() => setShowFilter('milestones')} />
                </div>
              </div>
              <div className="rgroup-label">Filter</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={Columns3} label="Columns" on={colMgrOpen} title="Add, show or hide columns" onClick={() => setColMgrOpen(true)} />
                <Big icon={Filter} label="Filter Row" on={filterRowOn} title="Show a filter box under each column header" onClick={() => setFilterRowOn(v => !v)} />
              </div>
              <div className="rgroup-label">Data</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <Sm icon={Save} label="Save View" title="Save columns, zoom, filter &amp; sort as a named view" onClick={saveCurrentView} />
                  <Sm icon={Flame} label="Critical" on={showCritical} title="Highlight the critical path" onClick={() => setShowCritical(v => !v)} />
                </div>
                <div className="rrow">
                  <Eye size={13} />
                  <select className="rb-select" value="" onChange={e => { const v = savedViews.find(x => x.name === e.target.value); if (v) applyView(v); e.target.value = ''; }}>
                    <option value="">Apply custom view…</option>
                    {savedViews.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                  </select>
                  {savedViews.length > 0 && (
                    <Sm label="✕" title="Delete a saved view" onClick={() => {
                      const n = prompt('Delete which saved view? Type its exact name:');
                      if (n) setSavedViews(prev => prev.filter(x => x.name !== n));
                    }} />
                  )}
                </div>
              </div>
              <div className="rgroup-label">Custom Views</div>
            </div>
          </div>
        )}

        {!fileOpen && tab === 'format' && (
          <div className="ribbon-pane">
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <select className="rb-select" disabled={!any} value={primary?.t.format?.family || ''}
                    onChange={e => store.applyUpdate(selIdList, { format: { family: e.target.value || null } })}>
                    <option value="">Default font</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="Calibri, sans-serif">Calibri</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="Verdana, sans-serif">Verdana</option>
                    <option value="'Courier New', monospace">Courier New</option>
                  </select>
                  <select className="rb-select" style={{ width: 58 }} disabled={!any} value={primary?.t.format?.size || ''}
                    onChange={e => store.applyUpdate(selIdList, { format: { size: e.target.value || null } })}>
                    <option value="">Size</option>
                    {[11, 12, 13, 14, 16, 18].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Sm icon={Bold} disabled={!any} on={!!primary?.t.format?.bold} title="Bold"
                    onClick={() => primary && store.applyUpdate(selIdList, { format: { bold: !primary.t.format?.bold } })} />
                  <Sm icon={Italic} disabled={!any} on={!!primary?.t.format?.italic} title="Italic"
                    onClick={() => primary && store.applyUpdate(selIdList, { format: { italic: !primary.t.format?.italic } })} />
                </div>
                <div className="rrow swatch-row">
                  <span className="swatch-tag">A</span>
                  <span className="swatch none" title="No colour" onClick={() => any && store.applyUpdate(selIdList, { format: { color: null } })} />
                  {COLORS.map(c => <span key={c} className="swatch" style={{ background: c }}
                    onClick={() => any && store.applyUpdate(selIdList, { format: { color: c } })} />)}
                  <input type="color" className="color-pick" title="Custom text colour" disabled={!any}
                    onChange={e => store.applyUpdate(selIdList, { format: { color: e.target.value } })} />
                  <span className="swatch-sep" />
                  <span className="swatch-tag">▉</span>
                  <span className="swatch none" title="No highlight" onClick={() => any && store.applyUpdate(selIdList, { format: { bg: null } })} />
                  {BGS.map(c => <span key={c} className="swatch" style={{ background: c }}
                    onClick={() => any && store.applyUpdate(selIdList, { format: { bg: c } })} />)}
                  <input type="color" className="color-pick" title="Custom highlight colour" disabled={!any}
                    onChange={e => store.applyUpdate(selIdList, { format: { bg: e.target.value } })} />
                </div>
              </div>
              <div className="rgroup-label">Text Styles</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <span className="rb-tag">Column</span>
                  <select className="rb-select" style={{ maxWidth: 118 }} value={alignCol} onChange={e => { setAlignCol(e.target.value); setSelectedCol(e.target.value); }}>
                    {cols.filter(c => c.key !== 'wbs' && c.key !== 'actions').map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <Sm icon={AlignLeft} title="Align column left" on={(colAlign[alignCol] || 'left') === 'left'} onClick={() => setColAlign(a => ({ ...a, [alignCol]: 'left' }))} />
                  <Sm icon={AlignCenter} title="Align column center" on={colAlign[alignCol] === 'center'} onClick={() => setColAlign(a => ({ ...a, [alignCol]: 'center' }))} />
                  <Sm icon={AlignRight} title="Align column right" on={colAlign[alignCol] === 'right'} onClick={() => setColAlign(a => ({ ...a, [alignCol]: 'right' }))} />
                </div>
                <div className="rrow">
                  <span className="rb-tag">Row</span>
                  <Sm label="Top" disabled={!any} on={primary?.t.format?.valign === 'top'} title="Align selected row(s) to top" onClick={() => store.applyUpdate(selIdList, { format: { valign: 'top' } })} />
                  <Sm label="Middle" disabled={!any} on={primary?.t.format?.valign === 'middle'} onClick={() => store.applyUpdate(selIdList, { format: { valign: 'middle' } })} />
                  <Sm label="Bottom" disabled={!any} on={primary?.t.format?.valign === 'bottom'} onClick={() => store.applyUpdate(selIdList, { format: { valign: 'bottom' } })} />
                </div>
              </div>
              <div className="rgroup-label">Alignment</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={PieChart} label="By Status" on={condFormat && condRules.length === 0}
                  title="Colour every row by its task status"
                  onClick={() => { const turningOn = !(condFormat && condRules.length === 0); setCondRules([]); setCondFormat(turningOn); }} />
                <Big icon={SlidersHorizontal} label="Rules…" on={condFormat && condRules.length > 0}
                  title="Build conditional-formatting rules (status, progress, overdue, resource…)"
                  onClick={() => setCondMgrOpen(true)} />
              </div>
              <div className="rgroup-label">Conditional</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={Flame} label="Critical" on={showCritical} onClick={() => setShowCritical(v => !v)} />
                <label className="crit-color" title="Critical path colour">
                  <input type="color" value={critColor} onChange={e => setCritColor(e.target.value)} />
                  <span>Path colour</span>
                </label>
              </div>
              <div className="rgroup-label">Bar Styles</div>
            </div>
          </div>
        )}

        {!fileOpen && tab === 'agile' && (
          <div className="ribbon-pane">
            <div className="rgroup">
              <div className="rgroup-body">
                <BigLink icon={Kanban} label="Sprint Board" href={cfg.urls.board} title="Kanban board — drag tasks across columns" />
                <BigLink icon={Workflow} label="Backlog / Network" href={cfg.urls.network} title="Dependencies &amp; backlog network" />
                <Big icon={BarChart3} label="Analytics" on={viewMode === 'agile'} title="Velocity, burndown &amp; sprint report" onClick={() => setViewMode('agile')} />
                <BigLink icon={Timer} label="Time Log" href={cfg.urls.timelog} />
              </div>
              <div className="rgroup-label">Agile Views</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body rgroup-stack">
                <div className="rrow">
                  <span className="rb-tag">Sprint</span>
                  <select className="rb-select" value={sprintTo} onChange={e => setSprintTo(e.target.value)}>
                    <option value="">Assign selected to…</option>
                    {data.sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value="none">— Backlog (no sprint) —</option>
                  </select>
                  <Sm label="Apply" disabled={!any || !sprintTo} onClick={() => {
                    store.applyUpdate(selIdList, { sprint_id: sprintTo === 'none' ? null : parseInt(sprintTo, 10) });
                    setSprintTo('');
                  }} />
                </div>
                <div className="rrow">
                  <span className="rb-tag">Points</span>
                  {[1, 2, 3, 5, 8, 13].map(pt => (
                    <Sm key={pt} label={String(pt)} disabled={!any} title={`Set ${pt} story points on the selection`}
                      onClick={() => store.applyUpdate(selIdList, { story_points: pt })} />
                  ))}
                </div>
              </div>
              <div className="rgroup-label">Sprint Planning</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={Table2} label="Sprint Column" on={!hiddenCols.has('sprint')} title="Show / hide the Sprint column"
                  onClick={() => setHiddenCols(prev => { const n = new Set(prev); n.has('sprint') ? n.delete('sprint') : n.add('sprint'); return n; })} />
                <Big icon={Rocket} label="Story Points" on={!hiddenCols.has('points')} title="Show / hide the Story Points column"
                  onClick={() => setHiddenCols(prev => { const n = new Set(prev); n.has('points') ? n.delete('points') : n.add('points'); return n; })} />
              </div>
              <div className="rgroup-label">Agile Fields</div>
            </div>
          </div>
        )}

        {!fileOpen && tab === 'report' && (
          <div className="ribbon-pane">
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={PieChart} label="Visual Reports" onClick={() => setReportsOpen(true)} />
                <Big icon={Info} label="Statistics" onClick={() => setStatsOpen(true)} />
                <Big icon={Flame} label="Critical Path" on={showCritical} title="Highlight the driving critical path" onClick={() => setShowCritical(v => !v)} />
                <BigLink icon={BarChart3} label="Dashboard" href={cfg.urls.dashboard} />
                <BigLink icon={ShieldAlert} label="Risk / RAID" href={cfg.urls.raid} title="Risk management log" />
              </div>
              <div className="rgroup-label">Reports</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={FileUp} label="Import Excel" title="Import tasks from .xlsx — extra columns come in as custom fields" onClick={importExcel} />
                <Big icon={FileCode2} label="Import MS Project" title="Import from MS Project .xml (MSPDI)" onClick={() => mspRef.current?.click()} />
              </div>
              <div className="rgroup-label">Import</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={FileDown} label="Save As" title="Export to Excel, PDF, PNG or MS Project" onClick={() => setSaveAsOpen(true)} />
                <BigLink icon={FileDown} label="Excel" href={cfg.urls.exportExcel} title="Export the task list to .xlsx" />
                <Big icon={FileText} label="PDF" title="Export the plan to PDF (print → Save as PDF)" onClick={exportPdf} />
                {cfg.urls.exportMsp && <BigLink icon={FileCode2} label="MS Project" href={cfg.urls.exportMsp} title="Export .xml (MSPDI) — opens natively in Microsoft Project" />}
                <Big icon={Image} label="Gantt PNG" onClick={exportGanttPng} />
                <Big icon={Printer} label="Print…" title="Advanced print setup" onClick={() => setPrintOpen(true)} />
              </div>
              <div className="rgroup-label">Export &amp; Print</div>
            </div>
          </div>
        )}

        {!fileOpen && tab === 'team' && (
          <div className="ribbon-pane">
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={UserPlus} label="Add Member" onClick={async () => {
                  const name = prompt('Member name:');
                  if (!name?.trim()) return;
                  const email = prompt('Email address:');
                  if (!email?.trim()) return;
                  const res = await fetch('/team/add/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': (document.cookie.match('(^|;)\\s*csrftoken\\s*=\\s*([^;]+)') || []).pop() || '' },
                    body: JSON.stringify({ name: name.trim(), email: email.trim(), role: 'MEMBER', project_id: cfg.projectId }),
                  });
                  if (!res.ok) { store.say(await res.text(), true); return; }
                  store.say(`${name.trim()} added to the workspace and this project`);
                  store.refetch();
                }} />
                <BigLink icon={Users} label="Accounts" href={cfg.urls.team} />
                <Big icon={CalendarClock} label="Capacity" title="Set part-time capacity &amp; PTO per resource"
                  onClick={() => {
                    setCapacityDraft(data.members.map(m => {
                      const rp = (data.resources || []).find(x => x.id === m.id);
                      return { id: m.id, name: m.name, units: rp?.units ?? 1, rate: rp?.rate ?? 0, working_days: rp?.working_days ?? null, time_off: (rp?.time_off ?? []).map(o => ({ ...o })) };
                    }));
                    setCapacityMgrOpen(true);
                  }} />
              </div>
              <div className="rgroup-label">Members</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <select className="rb-select" style={{ alignSelf: 'center' }} value={assignTo} onChange={e => setAssignTo(e.target.value)}>
                  <option value="">Assign selected to…</option>
                  {data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  <option value="none">— Unassign —</option>
                </select>
                <Sm label="Apply" disabled={!any || !assignTo}
                  onClick={() => {
                    store.applyUpdate(selIdList, { assignee_id: assignTo === 'none' ? null : parseInt(assignTo, 10) });
                    setAssignTo('');
                  }} />
              </div>
              <div className="rgroup-label">Assignment</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={Wifi} label={live ? 'Live: On' : 'Live: Off'} on={live}
                  title="Real-time collaboration — auto-syncs others’ edits every few seconds and shows live presence"
                  onClick={() => setLive(v => !v)} />
              </div>
              <div className="rgroup-label">Real-Time (rTc)</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body" style={{ minWidth: 210, maxWidth: 340 }}>
                <div className="collab-bar">
                  <span className={'live-dot' + (live ? ' on' : '')} />
                  {live ? (
                    <>
                      <span className="collab-here">
                        {collaborators.length > 1 ? `${collaborators.length} people here` : 'Only you here now'}
                      </span>
                      <div className="collab-avatars">
                        {collaborators.slice(0, 6).map(c => (
                          <span key={c.id} className={'avatar' + (c.you ? ' you' : '') + (c.editing ? ' editing' : '')}
                            title={c.name + (c.you ? ' (you)' : '') + (c.editing ? ' — editing' : '')}>
                            {c.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                          </span>
                        ))}
                      </div>
                      <span className="collab-sync">
                        {lastSync ? `synced ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'connecting…'}
                      </span>
                    </>
                  ) : (
                    <span className="collab-here">Live sync is off — turn it on to see who’s in the plan.</span>
                  )}
                </div>
              </div>
              <div className="rgroup-label">Who’s here</div>
            </div>
          </div>
        )}

        {!fileOpen && tab === 'window' && (
          <div className="ribbon-pane">
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={SplitSquareHorizontal} label="Split" on={viewMode === 'split'} title="Grid and Gantt side by side" onClick={() => setViewMode('split')} />
                <Big icon={Table2} label="Sheet Only" on={viewMode === 'sheet'} onClick={() => setViewMode('sheet')} />
                <Big icon={GanttChart} label="Chart Only" on={viewMode === 'chart'} onClick={() => setViewMode('chart')} />
              </div>
              <div className="rgroup-label">Arrange</div>
            </div>
            <div className="rgroup">
              <div className="rgroup-body">
                <Big icon={Monitor} label="Full Screen" onClick={() => {
                  if (document.fullscreenElement) document.exitFullscreen();
                  else document.documentElement.requestFullscreen();
                }} />
                <Big icon={Maximize2} label="Fit Project" title="Zoom the whole project into view" onClick={zoomEntireProject} />
              </div>
              <div className="rgroup-label">Window</div>
            </div>
          </div>
        )}

      </div>

      {!fileOpen && (viewMode === 'resources' || viewMode === 'usage') && (
        <div className="editor-card">
          <div className="resource-view">
            {viewMode === 'resources' && (
              <table className="res-table">
                <thead><tr><th>Resource</th><th>Email</th><th>Tasks</th><th>Overdue</th><th>Work (h)</th><th>Logged (h)</th></tr></thead>
                <tbody>
                  {resourceRows.map(r => (
                    <tr key={r.member.id}>
                      <td className="res-name">{r.member.name}</td>
                      <td className="res-muted">{r.member.email}</td>
                      <td>{r.count}</td>
                      <td className={r.overdue ? 'bad' : ''}>{r.overdue}</td>
                      <td>{r.work}</td><td>{r.logged}</td>
                    </tr>
                  ))}
                  <tr><td className="res-name res-muted">Unassigned</td><td /><td>{unassigned.length}</td><td /><td /><td /></tr>
                </tbody>
              </table>
            )}
            {viewMode === 'usage' && (
              <div className="usage-list">
                {resourceRows.filter(r => r.count).map(r => (
                  <div key={r.member.id} className="usage-block">
                    <h3>{r.member.name} <small>{r.count} task(s) · {r.work}h planned · {r.logged}h logged</small></h3>
                    <table className="res-table">
                      <tbody>
                        {r.tasks.map(t => (
                          <tr key={t.id}>
                            <td className="res-name">{t.title}</td>
                            <td className="res-muted">{t.start ?? '—'} → {t.end ?? '—'}</td>
                            <td>{t.progress}%</td>
                            <td>{t.estimated_hours ?? 0}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                {unassigned.length > 0 && (
                  <div className="usage-block">
                    <h3>Unassigned <small>{unassigned.length} task(s)</small></h3>
                    <table className="res-table"><tbody>
                      {unassigned.map(t => (
                        <tr key={t.id}><td className="res-name">{t.title}</td>
                          <td className="res-muted">{t.start ?? '—'} → {t.end ?? '—'}</td><td>{t.progress}%</td><td /></tr>
                      ))}
                    </tbody></table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!fileOpen && viewMode === 'workload' && (
        <div className="editor-card">
          <div className="workload-view">
            {!workload || !workload.rows.length ? (
              <p className="dw-muted" style={{ padding: 16 }}>Assign tasks (with dates) to resources to see the workload heatmap.</p>
            ) : (
              <>
                <div className="wl-summary">
                  <Activity size={16} />
                  {workload.overCount
                    ? <span><b>{workload.overCount}</b> resource{workload.overCount > 1 ? 's' : ''} overallocated — cells above 100% mean more assigned work than available capacity that week.</span>
                    : <span>No overallocation — every resource is within capacity across the plan.</span>}
                  <button className="dw-btn" onClick={() => {
                    setCapacityDraft(data.members.map(m => {
                      const rp = (data.resources || []).find(x => x.id === m.id);
                      return { id: m.id, name: m.name, units: rp?.units ?? 1, rate: rp?.rate ?? 0, working_days: rp?.working_days ?? null, time_off: (rp?.time_off ?? []).map(o => ({ ...o })) };
                    }));
                    setCapacityMgrOpen(true);
                  }}>Capacity &amp; PTO</button>
                  <button className="dw-btn primary" onClick={runLevel}>Level resources</button>
                  <span className="wl-legend">
                    <i style={{ background: '#86efac' }} />≤100%<i style={{ background: '#fde047' }} />≤150%<i style={{ background: '#fb923c' }} />≤200%<i style={{ background: '#ef4444' }} />&gt;200%
                  </span>
                </div>
                <div className="wl-scroll">
                  <table className="wl-table">
                    <thead>
                      <tr><th className="wl-res">Resource</th>{workload.weeks.map((w, i) => <th key={i}>{w.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {workload.rows.map(row => (
                        <tr key={row.member.id}>
                          <td className="wl-res">
                            {row.member.name}
                            {row.units !== 1 && <span className="wl-units">{Math.round(row.units * 100)}%</span>}
                            {row.over > 0 && <span className="wl-over">{row.over} wk over</span>}
                          </td>
                          {row.cells.map((c, i) => (
                            c.pto
                              ? <td key={i} className="wl-cell wl-pto" title={`${row.member.name} — week of ${workload.weeks[i].label}: time off`}>PTO</td>
                              : <td key={i} className="wl-cell" style={{ background: heatColor(c.ratio), color: c.ratio > 1.5 ? '#fff' : '#334155' }}
                                title={`${row.member.name} — week of ${workload.weeks[i].label}: ${Math.round(c.ratio * 100)}% of capacity`}>
                                {c.ratio > 0 ? Math.round(c.ratio * 100) + '%' : ''}
                              </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!fileOpen && viewMode === 'baseline' && (
        <div className="editor-card">
          <div className="baseline-view">
            {!activeBaseline ? (
              <div className="bl-empty">
                <p className="dw-muted">No baselines saved yet. Capture one to start tracking slippage.</p>
                <button className="dw-btn primary" onClick={() => setBaselineMgrOpen(true)}>Save a baseline</button>
              </div>
            ) : (
              <>
                <div className="bl-bar">
                  <GitCompare size={16} />
                  <span>Current plan vs</span>
                  <select className="rb-select" style={{ maxWidth: 220 }} value={activeBaseline.id} onChange={e => setBaselineId(parseInt(e.target.value, 10))}>
                    {data.baselines!.map(b => <option key={b.id} value={b.id}>{b.name} · {b.created_at}</option>)}
                  </select>
                  <span className="bl-key"><i className="bl-slip" />behind<i className="bl-ahead" />ahead</span>
                  <span className="insp-spring" />
                  <button className="dw-btn" onClick={() => setBaselineMgrOpen(true)}>Manage baselines</button>
                </div>
                <div className="bl-scroll">
                  <table className="bl-table">
                    <thead>
                      <tr>
                        <th className="bl-name">Task</th>
                        <th>Base start</th><th>Start</th><th>Δ start</th>
                        <th>Base finish</th><th>Finish</th><th>Δ finish</th>
                        <th>Δ dur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baselineRows.map(({ r, bs, be, startVar, finishVar, durVar }) => (
                        <tr key={r.t.id} className={r.isSummary ? 'summary' : ''}>
                          <td className="bl-name" style={{ paddingLeft: r.level * 14 + 8 }}>{r.t.is_milestone ? '◆ ' : ''}{r.t.title}</td>
                          <td>{bs ?? '—'}</td><td>{r.start ?? '—'}</td><td className={varCls(startVar)}>{varTxt(startVar)}</td>
                          <td>{be ?? '—'}</td><td>{r.end ?? '—'}</td><td className={varCls(finishVar)}>{varTxt(finishVar)}</td>
                          <td className={varCls(durVar)}>{varTxt(durVar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!fileOpen && viewMode === 'cost' && (
        <div className="editor-card">
          <div className="baseline-view">
            <div className="bl-bar">
              <DollarSign size={16} />
              <span>Cost &amp; Earned Value (rates from resource capacity)</span>
              <span className="insp-spring" />
              <button className="dw-btn" onClick={() => {
                setCapacityDraft(data.members.map(m => {
                  const rp = (data.resources || []).find(x => x.id === m.id);
                  return { id: m.id, name: m.name, units: rp?.units ?? 1, rate: rp?.rate ?? 0, working_days: rp?.working_days ?? null, time_off: (rp?.time_off ?? []).map(o => ({ ...o })) };
                }));
                setCapacityMgrOpen(true);
              }}>Set rates</button>
            </div>
            <div className="evm-cards">
              <div className="evm-card"><label>Budget (BAC)</label><span>{money(costView.BAC)}</span></div>
              <div className="evm-card"><label>Planned (PV)</label><span>{money(costView.PV)}</span></div>
              <div className="evm-card"><label>Earned (EV)</label><span>{money(costView.EV)}</span></div>
              <div className="evm-card"><label>Actual (AC)</label><span>{money(costView.AC)}</span></div>
              <div className="evm-card"><label>CPI</label><span className={costView.CPI && costView.CPI < 1 ? 'bad' : 'good'}>{costView.CPI.toFixed(2)}</span></div>
              <div className="evm-card"><label>SPI</label><span className={costView.SPI && costView.SPI < 1 ? 'bad' : 'good'}>{costView.SPI.toFixed(2)}</span></div>
            </div>
            <div className="bl-scroll">
              <table className="bl-table">
                <thead><tr><th className="bl-name">Task</th><th>Cost</th><th>%</th><th>Earned (EV)</th><th>Actual (AC)</th></tr></thead>
                <tbody>
                  {costView.rows.map(({ t, cost, ev, ac }) => (
                    <tr key={t.id}>
                      <td className="bl-name">{t.title}</td>
                      <td>{money(cost)}</td><td>{t.progress}%</td><td>{money(ev)}</td><td>{money(ac)}</td>
                    </tr>
                  ))}
                  {costView.rows.length === 0 && <tr><td className="bl-name" colSpan={5}>No active leaf tasks.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!fileOpen && viewMode === 'agile' && (
        <div className="editor-card">
          <div className="baseline-view">
            <div className="bl-bar">
              <BarChart3 size={16} />
              <span>Agile analytics — velocity &amp; burndown</span>
              <span className="insp-spring" />
              <span className="dw-muted">Avg velocity: <b>{agileData.avgVel}</b> pts / sprint</span>
            </div>
            <div className="agile-charts">
              <div className="agile-chart">
                <h4>Velocity — completed vs committed</h4>
                {agileData.sprints.length === 0 ? <p className="dw-muted">No sprints yet — create some from the board.</p> : (() => {
                  const rows = agileData.sprints;
                  const maxV = Math.max(1, ...rows.map(r => r.committed));
                  const bw = 46, gap = 24, H = 170, pad = 20;
                  const W = 10 + rows.length * (bw + gap);
                  const avgY = H - (agileData.avgVel / maxV) * (H - pad);
                  return (
                    <svg viewBox={`0 0 ${Math.max(W, 220)} ${H + 26}`} width="100%" height={H + 26}>
                      {agileData.avgVel > 0 && <><line x1={0} y1={avgY} x2={W} y2={avgY} stroke="#f59e0b" strokeDasharray="4 3" /><text x={2} y={avgY - 3} fontSize={9} fill="#b45309">avg {agileData.avgVel}</text></>}
                      {rows.map((r, i) => {
                        const x = 10 + i * (bw + gap);
                        const ch = (r.committed / maxV) * (H - pad);
                        const dh = (r.completed / maxV) * (H - pad);
                        return (
                          <g key={r.sprint.id}>
                            <rect x={x} y={H - ch} width={bw} height={ch} rx={3} fill="#dbe6fb" />
                            <rect x={x} y={H - dh} width={bw} height={dh} rx={3} fill="#0033a0" />
                            <text x={x + bw / 2} y={H - ch - 4} textAnchor="middle" fontSize={9} fill="#64748b">{r.completed}/{r.committed}</text>
                            <text x={x + bw / 2} y={H + 14} textAnchor="middle" fontSize={9} fill="#475569">{r.sprint.name.slice(0, 10)}</text>
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
                <div className="agile-legend"><i style={{ background: '#dbe6fb' }} />Committed<i style={{ background: '#0033a0' }} />Completed</div>
              </div>
              <div className="agile-chart">
                <h4>Sprint burndown
                  <select className="rb-select" style={{ marginLeft: 8, maxWidth: 150 }} value={agileData.bSprint?.id ?? ''} onChange={e => setBurndownSprint(e.target.value ? parseInt(e.target.value, 10) : null)}>
                    {data.sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </h4>
                {agileData.burndown.length === 0 ? <p className="dw-muted">Pick a sprint that has start &amp; end dates.</p> : (() => {
                  const pts = agileData.burndown;
                  const maxV = Math.max(1, ...pts.map(p => p.ideal));
                  const H = 170, W = Math.max(260, pts.length * 20), pad = 18;
                  const x = (i: number) => (i / (pts.length - 1 || 1)) * (W - pad) + pad * 0.5;
                  const y = (v: number) => H - (v / maxV) * (H - pad);
                  const idealPath = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.ideal)}`).join(' ');
                  const actPath = pts.filter(p => p.remaining != null).map((p, i) => { const gi = pts.indexOf(p); return `${i ? 'L' : 'M'} ${x(gi)} ${y(p.remaining as number)}`; }).join(' ');
                  return (
                    <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" height={H + 22}>
                      <line x1={pad * 0.5} y1={H} x2={W} y2={H} stroke="#e2e8f0" />
                      <path d={idealPath} fill="none" stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1.5} />
                      {actPath && <path d={actPath} fill="none" stroke="#0033a0" strokeWidth={2} />}
                    </svg>
                  );
                })()}
                <div className="agile-legend"><i style={{ background: '#94a3b8' }} />Ideal<i style={{ background: '#0033a0' }} />Remaining</div>
              </div>
            </div>
            <div className="bl-scroll">
              <table className="bl-table">
                <thead><tr><th className="bl-name">Sprint</th><th>Dates</th><th>Tasks</th><th>Done</th><th>Committed</th><th>Completed</th><th>Progress</th></tr></thead>
                <tbody>
                  {agileData.sprints.map(r => (
                    <tr key={r.sprint.id}>
                      <td className="bl-name">{r.sprint.name}</td>
                      <td>{r.sprint.start ?? '—'}{r.sprint.end ? ` → ${r.sprint.end}` : ''}</td>
                      <td>{r.tasks}</td><td>{r.done}</td><td>{r.committed}</td><td>{r.completed}</td><td>{r.progress}%</td>
                    </tr>
                  ))}
                  {agileData.sprints.length === 0 && <tr><td className="bl-name" colSpan={7}>No sprints yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!fileOpen && (viewMode === 'split' || viewMode === 'sheet' || viewMode === 'chart') && (
        <div className="editor-card">
          <div className="editor-scroll" ref={editorRef}>
            {viewMode !== 'chart' && (
              <div className={viewMode === 'sheet' ? 'grid-pane full' : 'grid-pane'}
                style={viewMode === 'split' ? { width: `${gridPct}%` } : undefined}>
                <Grid store={store} flat={displayFlat} cols={cols} colWidths={colWidths}
                  setColWidth={(k, w) => setColWidths(prev => ({ ...prev, [k]: w }))}
                  selectedIds={selectedIds} primaryId={primaryId} onSelect={onSelect}
                  collapsed={collapsed}
                  toggleCollapse={id => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                  statuses={statusDefs} members={data.members}
                  filterRowOn={filterRowOn} colFilters={colFilters}
                  onColFilter={(k, v) => setColFilters(prev => ({ ...prev, [k]: v }))}
                  colAlign={colAlign} condFormat={condFormat} condRules={condRules}
                  selectedCol={selectedCol}
                  onColSelect={k => { setSelectedCol(k); setAlignCol(k); }}
                  onColMenu={(k, x, y) => { setSelectedCol(k); setAlignCol(k); setColMenu({ key: k, x: Math.min(x, window.innerWidth - 210), y: Math.min(y, window.innerHeight - 260) }); }}
                  onAddTask={addTask} onIndent={indent} onOutdent={outdent}
                  onDelete={id => { setSelectedIds(new Set([id])); setPrimaryId(id); setTimeout(deleteSelection, 0); }}
                  onOpenDrawer={setDrawerId} onDropRow={onDropRow}
                  onHoverRow={setHoverRow}
                  onContextMenu={(id, x, y) => { setSelectedIds(new Set([id])); setPrimaryId(id); setCtxMenu({ id, x: Math.min(x, window.innerWidth - 210), y: Math.min(y, window.innerHeight - 300) }); }}
                  onReorderCols={reorderCols} onAddColumn={addColumn} />
              </div>
            )}
            {viewMode === 'split' && (
              <div className="splitter" title="Drag to resize" onPointerDown={startSplit}><span /></div>
            )}
            {viewMode !== 'sheet' && (
              <div className="gantt-pane" ref={ganttScrollRef}>
                <Gantt store={store} flat={displayFlat} dayWidth={dayWidth} showCritical={showCritical}
                  onSelect={id => { setSelectedIds(new Set([id])); setPrimaryId(id); }}
                  onOpenDrawer={setDrawerId} scrollRef={ganttScrollRef} todayXRef={todayXRef}
                  hoverRow={hoverRow} onHoverRow={setHoverRow} xOfRef={xOfRef} critColor={critColor}
                  statusColorOf={statusColorOf} />
              </div>
            )}
          </div>
          {inspectorOn && (
            <div className="inspector-pane">
              {!primary ? (
                <div className="insp-empty"><PanelBottom size={15} /> Select a task to inspect its schedule, drivers &amp; warnings.</div>
              ) : (() => {
                const t = primary.t;
                const sd = statusDefs.find(s => s.key === t.status);
                const dur = primary.start && primary.end ? wdCal.count(D(primary.start), D(primary.end)) : null;
                const isCrit = critSet.has(t.id);
                const preds = (t.predecessors || []).map(pr => flat.find(r => r.t.id === pr.id)?.wbs).filter(Boolean).join(', ');
                const myUsers = taskUsers(t);
                const overlaps = myUsers.length ? leaf.filter(x => x.id !== t.id && taskUsers(x).some(u => myUsers.includes(u))
                  && x.start && x.end && primary.start && primary.end && !(x.end! < primary.start! || x.start! > primary.end!)) : [];
                const bSnap = activeBaseline?.snapshot[String(t.id)];
                const slip = bSnap?.end && primary.end ? diffDays(D(bSnap.end)!, D(primary.end)!) : null;
                const warns: { level: 'warn' | 'info' | 'ok'; msg: string }[] = [];
                if (t.deadline && primary.end && primary.end > t.deadline) warns.push({ level: 'warn', msg: `Finishes after its deadline (${t.deadline})` });
                if (!primary.isSummary && !t.is_milestone && !t.assignee) warns.push({ level: 'warn', msg: 'No resource assigned' });
                if (overlaps.length) warns.push({ level: 'warn', msg: `Resource conflict with: ${overlaps.slice(0, 3).map(x => x.title).join(', ')}` });
                if (slip != null && slip > 0) warns.push({ level: 'warn', msg: `${slip} day${slip > 1 ? 's' : ''} behind “${activeBaseline!.name}” baseline` });
                if (slip != null && slip < 0) warns.push({ level: 'ok', msg: `${-slip} day${-slip < -1 ? 's' : ''} ahead of baseline` });
                if (isCrit) warns.push({ level: 'info', msg: 'On the critical path — slipping this delays the finish' });
                if (!warns.length) warns.push({ level: 'ok', msg: 'No scheduling issues detected' });
                return (
                  <>
                    <div className="insp-head">
                      <span className="insp-title">{t.is_milestone ? '◆ ' : ''}{t.title}</span>
                      <span className="insp-wbs">WBS {primary.wbs}</span>
                      {isCrit && <span className="insp-chip crit">Critical</span>}
                      <span className="insp-spring" />
                      <button className="dw-btn" onClick={() => setDrawerId(t.id)}>Open details</button>
                    </div>
                    <div className="insp-grid">
                      <div><label>Start</label><span>{primary.start ?? '—'}</span></div>
                      <div><label>Finish</label><span>{primary.end ?? '—'}</span></div>
                      <div><label>Duration</label><span>{dur != null ? `${dur}d` : '—'}</span></div>
                      <div><label>% Complete</label><span>{primary.progress}%</span></div>
                      <div><label>Status</label><span className="insp-status"><i style={{ background: sd?.color || '#cbd5e1' }} />{sd?.name ?? t.status}</span></div>
                      <div><label>Resource</label><span>{t.assignee?.name ?? 'Unassigned'}</span></div>
                      <div><label>Predecessors</label><span>{preds || 'None — can start anytime'}</span></div>
                      <div><label>Constraint</label><span>{t.constraint_type}{t.constraint_date ? ` · ${t.constraint_date}` : ''}</span></div>
                      <div><label>Deadline</label><span>{t.deadline ?? '—'}</span></div>
                    </div>
                    <ul className="insp-warns">
                      {warns.map((w, i) => <li key={i} className={'iw ' + w.level}>{w.msg}</li>)}
                    </ul>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      <Drawer store={store} taskId={drawerId} onClose={() => setDrawerId(null)} statuses={statusDefs} agile={agile} />

      {reportsOpen && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setReportsOpen(false); }}>
          <div className="modal modal-wide">
            <h2>Visual reports</h2>
            <div className="charts">
              <div className="chart">
                <h4>Task status</h4>
                {(() => {
                  const groups = statusDefs.map(s => ({ label: s.name, n: leaf.filter(t => t.status === s.key).length, color: s.color }));
                  const total = Math.max(1, leaf.length);
                  const palette = groups.map(g => g.color);
                  let acc = 0;
                  const R = 40, C = 2 * Math.PI * R;
                  return (
                    <>
                      <svg viewBox="0 0 120 120" width="130" height="130">
                        {groups.map((g, i) => {
                          const frac = g.n / total;
                          const el = (
                            <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={palette[i % palette.length] || '#94a3b8'} strokeWidth="18"
                              strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-acc * C}
                              transform="rotate(-90 60 60)" />
                          );
                          acc += frac;
                          return el;
                        })}
                        <text x="60" y="64" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f172a">{stats.progress}%</text>
                      </svg>
                      <div className="legend">
                        {groups.map((g, i) => (
                          <span key={i}><i style={{ background: palette[i % palette.length] || '#94a3b8' }} />{g.label}: {g.n}</span>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="chart">
                <h4>Workload by resource</h4>
                {(() => {
                  const rows = resourceRows.filter(r => r.count).sort((a, b) => b.count - a.count).slice(0, 8);
                  const max = Math.max(1, ...rows.map(r => r.count), unassigned.length);
                  return (
                    <div className="hbars">
                      {rows.map(r => (
                        <div key={r.member.id} className="hbar">
                          <span className="hbar-label">{r.member.name}</span>
                          <div className="hbar-track"><div style={{ width: `${(r.count / max) * 100}%` }} /></div>
                          <span className="hbar-val">{r.count}</span>
                        </div>
                      ))}
                      <div className="hbar">
                        <span className="hbar-label">Unassigned</span>
                        <div className="hbar-track"><div className="grey" style={{ width: `${(unassigned.length / max) * 100}%` }} /></div>
                        <span className="hbar-val">{unassigned.length}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="chart">
                <h4>Progress by phase</h4>
                {(() => {
                  const phases = childrenOf(data.tasks, null);
                  const rows = phases.map(ph => {
                    const kids = leaf.filter(t => {
                      let p: Task | undefined = t;
                      while (p) { if (p.id === ph.id) return true; p = data.tasks.find(x => x.id === p!.parent_id!); }
                      return false;
                    });
                    const prog = kids.length ? Math.round(kids.reduce((s, t) => s + t.progress, 0) / kids.length) : ph.progress;
                    return { name: ph.title, prog };
                  }).slice(0, 8);
                  return (
                    <div className="hbars">
                      {rows.map((r, i) => (
                        <div key={i} className="hbar">
                          <span className="hbar-label">{r.name}</span>
                          <div className="hbar-track"><div className="green" style={{ width: `${r.prog}%` }} /></div>
                          <span className="hbar-val">{r.prog}%</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => window.print()}>Print</button>
              <button className="dw-btn primary" onClick={() => setReportsOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {statsOpen && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setStatsOpen(false); }}>
          <div className="modal">
            <h2>Project statistics</h2>
            <table className="stats-table">
              <tbody>
                <tr><td>Start</td><td>{stats.start ?? '—'}</td><td>Finish</td><td>{stats.finish ?? '—'}</td></tr>
                <tr><td>Tasks</td><td>{stats.total}</td><td>Milestones</td><td>{stats.milestones}</td></tr>
                <tr><td>Complete</td><td>{stats.complete}</td><td>In progress</td><td>{stats.inProgress}</td></tr>
                <tr><td>Overdue</td><td className={stats.overdue ? 'bad' : ''}>{stats.overdue}</td><td>On critical path</td><td>{stats.critical}</td></tr>
                <tr><td>Overall progress</td><td>{stats.progress}%</td><td>Work planned / logged</td><td>{stats.work}h / {stats.logged}h</td></tr>
              </tbody>
            </table>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => setStatsOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {calOpen && calDraft && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setCalOpen(false); }}>
          <div className="modal">
            <h2>Project calendar</h2>
            <p className="dw-muted">Durations and auto-scheduling only count working days.</p>
            <p className="dw-label">Working days</p>
            <div className="rrow" style={{ flexWrap: 'wrap' }}>
              {DOW.map(([n, l]) => (
                <Sm key={n} label={l} on={calDraft.working_days.includes(n)}
                  onClick={() => setCalDraft(d => d && ({
                    ...d,
                    working_days: d.working_days.includes(n) ? d.working_days.filter(x => x !== n) : [...d.working_days, n],
                  }))} />
              ))}
            </div>
            <p className="dw-label" style={{ marginTop: 12 }}>Holidays</p>
            {calDraft.holidays.map((h, i) => (
              <div key={i} className="dw-chip"><span>{h.name} — {h.date}</span>
                <button onClick={() => setCalDraft(d => d && ({ ...d, holidays: d.holidays.filter((_, j) => j !== i) }))}>✕</button></div>
            ))}
            <div className="dw-row">
              <input id="cal-h-name" placeholder="Holiday name" />
              <input id="cal-h-date" type="date" />
              <button className="dw-btn" onClick={() => {
                const name = (document.getElementById('cal-h-name') as HTMLInputElement).value.trim();
                const date = (document.getElementById('cal-h-date') as HTMLInputElement).value;
                if (!name || !date) { store.say('Holiday needs a name and a date', true); return; }
                setCalDraft(d => d && ({ ...d, holidays: [...d.holidays, { name, date }] }));
              }}>Add</button>
            </div>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => setCalOpen(false)}>Cancel</button>
              <button className="dw-btn primary" onClick={async () => {
                if (!calDraft.working_days.length) { store.say('Pick at least one working day', true); return; }
                try { await store.api.updateCalendar(calDraft); setCalOpen(false); store.say('Calendar saved'); store.refetch(); }
                catch (e) { store.say((e as Error).message, true); }
              }}>Save calendar</button>
            </div>
          </div>
        </div>
      )}

      {condMgrOpen && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setCondMgrOpen(false); }}>
          <div className="modal modal-wide">
            <h2>Conditional formatting rules</h2>
            <p className="dw-muted">Each row is coloured by the first rule that matches. Set a text colour, a fill, or both.</p>
            <div className="cf-list">
              <div className="cf-row cf-head"><span>When</span><span>Is</span><span>Value</span><span>Text</span><span>Fill</span><span /></div>
              {condRules.map((rule, i) => {
                const upd = (patch: Partial<CondRule>) => setCondRules(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
                return (
                  <div key={i} className="cf-row">
                    <select value={rule.field} onChange={e => upd({ field: e.target.value, value: '' })}>
                      <option value="status">Status</option>
                      <option value="progress">Progress %</option>
                      <option value="overdue">Overdue</option>
                      <option value="milestone">Milestone</option>
                      <option value="assignee">Assigned to</option>
                    </select>
                    {rule.field === 'progress'
                      ? <select value={rule.op} onChange={e => upd({ op: e.target.value })}>
                          <option value="lt">is &lt;</option><option value="gt">is &gt;</option><option value="eq">is =</option>
                        </select>
                      : <span className="rb-tag" style={{ alignSelf: 'center', textAlign: 'center' }}>is</span>}
                    {rule.field === 'status'
                      ? <select value={rule.value} onChange={e => upd({ value: e.target.value })}><option value="" />{statusDefs.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
                      : rule.field === 'assignee'
                        ? <select value={rule.value} onChange={e => upd({ value: e.target.value })}><option value="" />{data.members.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}</select>
                        : (rule.field === 'overdue' || rule.field === 'milestone')
                          ? <select value={rule.value || 'true'} onChange={e => upd({ value: e.target.value })}><option value="true">Yes</option><option value="false">No</option></select>
                          : <input type="number" value={rule.value} onChange={e => upd({ value: e.target.value })} />}
                    {rule.color
                      ? <input type="color" value={rule.color} onChange={e => upd({ color: e.target.value })} title="Text colour (click swatch to remove)" onDoubleClick={() => upd({ color: '' })} />
                      : <button type="button" className="cf-swatch-off" title="Add text colour" onClick={() => upd({ color: '#b91c1c' })}>A</button>}
                    {rule.bg
                      ? <input type="color" value={rule.bg} onChange={e => upd({ bg: e.target.value })} title="Fill (double-click to remove)" onDoubleClick={() => upd({ bg: '' })} />
                      : <button type="button" className="cf-swatch-off" title="Add fill" onClick={() => upd({ bg: '#fee2e2' })}>▉</button>}
                    <button type="button" className="cf-del" onClick={() => setCondRules(rs => rs.filter((_, j) => j !== i))}>✕</button>
                  </div>
                );
              })}
              {condRules.length === 0 && <p className="dw-muted">No rules yet — add one below.</p>}
            </div>
            <button className="dw-btn" style={{ marginTop: 10 }}
              onClick={() => setCondRules(rs => [...rs, { field: 'overdue', op: 'eq', value: 'true', color: '', bg: '#fee2e2' }])}>+ Add rule</button>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => setCondMgrOpen(false)}>Close</button>
              <button className="dw-btn primary" onClick={() => { setCondFormat(true); setCondMgrOpen(false); }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {recurringOpen && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setRecurringOpen(false); }}>
          <div className="modal">
            <h2>Recurring task</h2>
            <p className="dw-muted">Creates a series of occurrences grouped under a summary task.</p>
            <div className="dw-row" style={{ marginTop: 10 }}><input id="rec-title" placeholder="Task name (e.g. Weekly status)" style={{ flex: 1 }} /></div>
            <div className="dw-grid3" style={{ marginTop: 10 }}>
              <div><label className="dw-label">Repeats</label>
                <select id="rec-pattern" className="rb-select" style={{ maxWidth: '100%' }} defaultValue="WEEKLY">
                  <option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
                </select></div>
              <div><label className="dw-label">Occurrences</label><input id="rec-count" type="number" min={1} max={60} defaultValue={4} /></div>
              <div><label className="dw-label">Duration (d)</label><input id="rec-dur" type="number" min={1} defaultValue={1} /></div>
            </div>
            <div style={{ marginTop: 10 }}><label className="dw-label">Start</label><input id="rec-start" type="date" defaultValue={data.project.start ?? ''} /></div>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => setRecurringOpen(false)}>Cancel</button>
              <button className="dw-btn primary" onClick={async () => {
                const title = (document.getElementById('rec-title') as HTMLInputElement).value.trim();
                if (!title) { store.say('Give the recurring task a name', true); return; }
                const payload = {
                  title,
                  pattern: (document.getElementById('rec-pattern') as HTMLSelectElement).value,
                  count: parseInt((document.getElementById('rec-count') as HTMLInputElement).value, 10) || 1,
                  duration: parseInt((document.getElementById('rec-dur') as HTMLInputElement).value, 10) || 1,
                  start_date: (document.getElementById('rec-start') as HTMLInputElement).value || null,
                };
                try { const r = await store.api.createRecurring(payload); setRecurringOpen(false); store.say(`Created ${r.created} occurrence(s)`); store.refetch(); }
                catch (e) { store.say((e as Error).message, true); }
              }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {saveAsOpen && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setSaveAsOpen(false); }}>
          <div className="modal modal-wide">
            <h2>Save As / Export</h2>
            <p className="dw-muted">Choose a format to export “{data.project.name}”.</p>
            <div className="bs-cards">
              <a href={cfg.urls.exportExcel}><FileDown size={20} /><span>Excel workbook (.xlsx)</span><small>Full task list with WBS, dates, predecessors &amp; custom columns</small></a>
              <a onClick={e => { e.preventDefault(); exportPdf(); }} href="#"><FileText size={20} /><span>PDF (.pdf)</span><small>Print the grid + Gantt — pick “Save as PDF”</small></a>
              <a onClick={e => { e.preventDefault(); setSaveAsOpen(false); exportGanttPng(); }} href="#"><Image size={20} /><span>Gantt image (.png)</span><small>The chart exactly as shown</small></a>
              {cfg.urls.exportMsp && <a href={cfg.urls.exportMsp}><FileCode2 size={20} /><span>MS Project (.xml)</span><small>MSPDI — File ▸ Open in Microsoft Project</small></a>}
            </div>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => setSaveAsOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {colMgrOpen && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setColMgrOpen(false); }}>
          <div className="modal modal-wide">
            <h2>Columns</h2>
            <p className="dw-muted">Show or hide columns, delete custom ones, or add your own — including a <b>Choice</b> field with your own options (a custom status field).</p>
            <div className="col-mgr">
              {[...BASE_COLS.filter(c => !c.fixed && (agile || (c.key !== 'sprint' && c.key !== 'points'))), ...data.custom_fields.map(f => ({ key: 'cf_' + f.id, label: f.name, custom: f } as ColDef))].map(c => (
                <label key={c.key} className="col-toggle">
                  <input type="checkbox" checked={!hiddenCols.has(c.key)}
                    onChange={e => setHiddenCols(prev => { const n = new Set(prev); e.target.checked ? n.delete(c.key) : n.add(c.key); return n; })} />
                  <span>{c.label}{c.custom && <em className="col-badge">{c.custom.type === 'SELECT' ? 'choice' : c.custom.type.toLowerCase()}</em>}</span>
                  {c.custom && <button className="col-del" title="Delete custom column" onClick={async ev => {
                    ev.preventDefault();
                    if (!confirm(`Delete custom column "${c.custom!.name}"?`)) return;
                    try { await store.api.deleteField(c.custom!.id); store.refetch(); } catch { /* noop */ }
                  }}>✕</button>}
                </label>
              ))}
            </div>
            <div className="col-add">
              <p className="dw-label">Add a column</p>
              <div className="col-add-row">
                <input placeholder="Column name" value={newField.name} onChange={e => setNewField(f => ({ ...f, name: e.target.value }))} />
                <select className="rb-select" style={{ maxWidth: 190 }} value={newField.type} onChange={e => setNewField(f => ({ ...f, type: e.target.value }))}>
                  <option value="TEXT">Text</option>
                  <option value="NUMBER">Number</option>
                  <option value="DATE">Date</option>
                  <option value="BOOLEAN">Yes / No</option>
                  <option value="SELECT">Choice (custom status)</option>
                </select>
                <button className="dw-btn primary" onClick={createField}>Add</button>
              </div>
              {newField.type === 'SELECT' && (
                <input className="col-opts" placeholder="Choices, comma-separated — e.g. Draft, In Review, Approved" value={newField.options}
                  onChange={e => setNewField(f => ({ ...f, options: e.target.value }))} />
              )}
            </div>
            <div className="modal-actions">
              <button className="dw-btn primary" onClick={() => setColMgrOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {statusMgrOpen && statusDraft && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setStatusMgrOpen(false); }}>
          <div className="modal modal-wide">
            <h2>Task statuses</h2>
            <p className="dw-muted">Rename, recolour, reorder, add or remove. The category keeps scheduling &amp; the board working — anything in <b>Complete</b> marks tasks 100%.</p>
            <div className="status-editor">
              <div className="status-row status-head">
                <span>Colour</span><span>Name</span><span>Category</span><span /><span /><span />
              </div>
              {statusDraft.map((s, i) => (
                <div key={i} className="status-row">
                  <input type="color" value={/^#([0-9a-f]{6})$/i.test(s.color) ? s.color : '#94a3b8'}
                    onChange={e => setStatusDraft(d => d && d.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} />
                  <input className="status-name" value={s.name} placeholder="Status name"
                    onChange={e => setStatusDraft(d => d && d.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <select className="rb-select" value={s.category}
                    onChange={e => setStatusDraft(d => d && d.map((x, j) => j === i ? { ...x, category: e.target.value as StatusCategory } : x))}>
                    <option value="NOT_STARTED">Not started</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="DONE">Complete</option>
                  </select>
                  <button className="st-move" disabled={i === 0} title="Move up"
                    onClick={() => setStatusDraft(d => { if (!d || i === 0) return d; const n = [...d]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>↑</button>
                  <button className="st-move" disabled={i === statusDraft.length - 1} title="Move down"
                    onClick={() => setStatusDraft(d => { if (!d || i === d.length - 1) return d; const n = [...d]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>↓</button>
                  <button className="st-del" disabled={statusDraft.length <= 1} title="Delete (its tasks move to a remaining status)"
                    onClick={() => setStatusDraft(d => d && d.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
            <button className="dw-btn" style={{ marginTop: 10 }}
              onClick={() => setStatusDraft(d => [...(d || []), { key: '', name: 'New status', category: 'NOT_STARTED' as StatusCategory, color: '#8b5cf6' }])}>
              + Add status
            </button>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => setStatusMgrOpen(false)}>Cancel</button>
              <button className="dw-btn primary" onClick={async () => {
                const clean = (statusDraft || []).filter(s => s.name.trim());
                if (!clean.length) { store.say('Keep at least one status', true); return; }
                try {
                  await store.api.saveStatuses(clean);
                  setStatusMgrOpen(false);
                  store.say('Statuses saved');
                  store.refetch();
                } catch (e) { store.say((e as Error).message, true); }
              }}>Save statuses</button>
            </div>
          </div>
        </div>
      )}

      {baselineMgrOpen && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setBaselineMgrOpen(false); }}>
          <div className="modal">
            <h2>Baselines</h2>
            <p className="dw-muted">Save a snapshot of today’s plan, then track slippage against it in the Baseline view. Keep several to compare over time.</p>
            <div className="dw-row" style={{ marginTop: 10 }}>
              <input id="bl-name" placeholder={`Baseline ${(data.baselines?.length || 0) + 1}`} />
              <button className="dw-btn primary" onClick={async () => {
                const name = (document.getElementById('bl-name') as HTMLInputElement).value.trim();
                try {
                  const r = await store.api.saveBaseline(name);
                  setBaselineId(r.baseline.id);
                  store.say(`Baseline “${r.baseline.name}” saved`);
                  await store.refetch();
                } catch (e) { store.say((e as Error).message, true); }
              }}>Save baseline</button>
            </div>
            <div className="bl-list">
              {(data.baselines || []).length === 0 && <p className="dw-muted">No baselines yet.</p>}
              {(data.baselines || []).map(b => (
                <div key={b.id} className="bl-row">
                  <span><b>{b.name}</b><small> · {b.created_at}</small></span>
                  <span className="insp-spring" />
                  <button className="dw-link" onClick={() => { setBaselineId(b.id); setViewMode('baseline'); setBaselineMgrOpen(false); }}>Compare</button>
                  <button className="bl-del" title="Delete" onClick={async () => {
                    if (!confirm(`Delete baseline “${b.name}”?`)) return;
                    try { await store.api.deleteBaseline(b.id); if (baselineId === b.id) setBaselineId(null); store.refetch(); }
                    catch (e) { store.say((e as Error).message, true); }
                  }}>✕</button>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => setBaselineMgrOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {capacityMgrOpen && capacityDraft && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setCapacityMgrOpen(false); }}>
          <div className="modal modal-wide">
            <h2>Resource capacity &amp; time off</h2>
            <p className="dw-muted">Set each person’s availability (100% = full-time, 50% = half-time) and their PTO. The workload heatmap and auto-leveling both use these.</p>
            <div className="cap-list">
              {capacityDraft.map((m, mi) => (
                <div key={m.id} className="cap-row">
                  <div className="cap-head">
                    <span className="cap-name">{m.name}</span>
                    <label className="cap-units">Capacity
                      <input type="number" min={0} max={200} step={10} value={Math.round(m.units * 100)}
                        onChange={e => setCapacityDraft(d => d && d.map((x, j) => j === mi ? { ...x, units: (parseInt(e.target.value, 10) || 0) / 100 } : x))} />%
                    </label>
                    <label className="cap-units">Rate
                      <input type="number" min={0} step={5} value={m.rate}
                        onChange={e => setCapacityDraft(d => d && d.map((x, j) => j === mi ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))} />/h
                    </label>
                  </div>
                  <div className="cap-days">
                    <span className="rb-tag">Working week</span>
                    {[[1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [7, 'S']].map(([n, l]) => {
                      const days = m.working_days ?? [1, 2, 3, 4, 5];
                      const on = days.includes(n as number);
                      return (
                        <button key={n as number} type="button" className={'cap-day' + (on ? ' on' : '')}
                          onClick={() => setCapacityDraft(d => d && d.map((x, j) => {
                            if (j !== mi) return x;
                            const cur = x.working_days ?? [1, 2, 3, 4, 5];
                            const next = on ? cur.filter(v => v !== n) : [...cur, n as number].sort();
                            return { ...x, working_days: (next.length === 5 && next.every((v, i) => v === i + 1)) ? null : next };
                          }))}>{l as string}</button>
                      );
                    })}
                  </div>
                  <div className="cap-pto">
                    {m.time_off.map((o, oi) => (
                      <span key={oi} className="cap-chip">
                        {o.start} → {o.end}{o.note ? ` · ${o.note}` : ''}
                        <button onClick={() => setCapacityDraft(d => d && d.map((x, j) => j === mi ? { ...x, time_off: x.time_off.filter((_, k) => k !== oi) } : x))}>✕</button>
                      </span>
                    ))}
                    <span className="cap-add">
                      <input type="date" id={`pto-s-${m.id}`} />
                      <input type="date" id={`pto-e-${m.id}`} />
                      <input type="text" id={`pto-n-${m.id}`} placeholder="Note" />
                      <button className="dw-btn" onClick={() => {
                        const s = (document.getElementById(`pto-s-${m.id}`) as HTMLInputElement).value;
                        const e2 = (document.getElementById(`pto-e-${m.id}`) as HTMLInputElement).value;
                        const n = (document.getElementById(`pto-n-${m.id}`) as HTMLInputElement).value;
                        if (!s || !e2) { store.say('PTO needs a start and end date', true); return; }
                        setCapacityDraft(d => d && d.map((x, j) => j === mi ? { ...x, time_off: [...x.time_off, { start: s, end: e2, note: n || undefined }] } : x));
                      }}>Add PTO</button>
                    </span>
                  </div>
                </div>
              ))}
              {capacityDraft.length === 0 && <p className="dw-muted">No members in this workspace yet.</p>}
            </div>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => setCapacityMgrOpen(false)}>Cancel</button>
              <button className="dw-btn primary" onClick={async () => {
                try {
                  for (const m of capacityDraft) await store.api.saveResourceProfile(m.id, m.units, m.time_off, m.rate, m.working_days);
                  setCapacityMgrOpen(false);
                  store.say('Resource capacity saved');
                  store.refetch();
                } catch (e) { store.say((e as Error).message, true); }
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const r = await store.api.importExcel(f);
            store.say(`Imported ${r.created} task(s)` + (r.warnings.length ? ` — ${r.warnings.length} warning(s) in console` : ''));
            if (r.warnings.length) console.warn(r.warnings);
            store.refetch();
          } catch (err) { store.say((err as Error).message, true); }
        }} />

      <input ref={mspRef} type="file" accept=".xml" style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const r = await store.api.importMsp(f);
            store.say(`Imported ${r.created} task(s) from MS Project` + (r.warnings?.length ? ` — ${r.warnings.length} warning(s) in console` : ''));
            if (r.warnings?.length) console.warn(r.warnings);
            store.refetch();
          } catch (err) { store.say((err as Error).message, true); }
        }} />

      {printOpen && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setPrintOpen(false); }}>
          <div className="modal">
            <h2>Print setup</h2>
            <p className="dw-muted">Pick what to print and how it fits the page.</p>
            <p className="dw-label" style={{ marginTop: 12 }}>What to print</p>
            <div className="rrow">
              <Sm label="Grid + Gantt" on={printOpts.scope === 'both'} onClick={() => setPrintOpts(o => ({ ...o, scope: 'both' }))} />
              <Sm label="Task sheet" on={printOpts.scope === 'sheet'} onClick={() => setPrintOpts(o => ({ ...o, scope: 'sheet' }))} />
              <Sm label="Gantt only" on={printOpts.scope === 'chart'} onClick={() => setPrintOpts(o => ({ ...o, scope: 'chart' }))} />
            </div>
            <p className="dw-label" style={{ marginTop: 12 }}>Orientation</p>
            <div className="rrow">
              <Sm label="Landscape" on={printOpts.orientation === 'landscape'} onClick={() => setPrintOpts(o => ({ ...o, orientation: 'landscape' }))} />
              <Sm label="Portrait" on={printOpts.orientation === 'portrait'} onClick={() => setPrintOpts(o => ({ ...o, orientation: 'portrait' }))} />
            </div>
            <label className="dw-check" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={printOpts.fit} onChange={e => setPrintOpts(o => ({ ...o, fit: e.target.checked }))} /> Fit to page width
            </label>
            <div className="modal-actions">
              <button className="dw-btn" onClick={() => setPrintOpen(false)}>Cancel</button>
              <button className="dw-btn primary" onClick={runPrint}>Print…</button>
            </div>
          </div>
        </div>
      )}

      {!fileOpen && (
        <div className="statusbar">
          <span className="sb-item sb-mode">{
            viewMode === 'split' ? 'Gantt Chart' : viewMode === 'sheet' ? 'Task Sheet' :
            viewMode === 'chart' ? 'Timeline' : viewMode === 'resources' ? 'Resource Sheet' :
            viewMode === 'usage' ? 'Resource Usage' : viewMode === 'workload' ? 'Resource Workload' :
            viewMode === 'baseline' ? 'Baseline Comparison' : viewMode === 'cost' ? 'Cost / Earned Value' :
            viewMode === 'agile' ? 'Agile Analytics' : 'Resource Usage'
          }</span>
          <span className="sb-sep" />
          <span className="sb-item">{displayFlat.length} of {flat.length} rows</span>
          {colAgg && (
            <span className="sb-item sb-colagg" title="Selected column — click a header to change">
              Col: <b>{colAgg.label}</b>{colAgg.sum != null ? ` · Σ ${Math.round(colAgg.sum * 10) / 10} · avg ${Math.round((colAgg.avg || 0) * 10) / 10}` : ''}
            </span>
          )}
          <span className="sb-item">{stats.total} tasks</span>
          <span className="sb-item">{stats.milestones} milestones</span>
          <span className="sb-item">{stats.progress}% complete</span>
          {showCritical && <span className="sb-item sb-crit">Critical: {stats.critical}</span>}
          <span className="sb-spring" />
          <span className={'sb-item sb-live' + (live ? ' on' : '')}
            title="Toggle real-time collaboration" onClick={() => setLive(v => !v)}>
            <span className={'live-dot' + (live ? ' on' : '')} />
            {live ? (collaborators.length > 1 ? `${collaborators.length} online` : 'Live') : 'Offline'}
          </span>
          <span className="sb-item sb-zoom">
            <button title="Zoom out (Month)" onClick={() => setDayWidth(w => Math.max(2, w - 4))}>−</button>
            <span>{dayWidth >= 20 ? 'Day' : dayWidth >= 8 ? 'Week' : 'Month'}</span>
            <button title="Zoom in (Day)" onClick={() => setDayWidth(w => Math.min(28, w + 4))}>+</button>
          </span>
        </div>
      )}

      {colMenu && (() => {
        const col = cols.find(c => c.key === colMenu.key);
        const fixed = colMenu.key === 'wbs' || colMenu.key === 'name' || colMenu.key === 'actions';
        const isCustom = colMenu.key.startsWith('cf_');
        const close = () => setColMenu(null);
        return (
          <div className="ctx-menu" style={{ left: colMenu.x, top: colMenu.y }} onClick={e => e.stopPropagation()}>
            <div className="ctx-title">{col?.label || 'Column'}</div>
            <button className="ctx-item" onClick={() => { setColAlign(a => ({ ...a, [colMenu.key]: 'left' })); close(); }}><AlignLeft size={13} /> Align left</button>
            <button className="ctx-item" onClick={() => { setColAlign(a => ({ ...a, [colMenu.key]: 'center' })); close(); }}><AlignCenter size={13} /> Align center</button>
            <button className="ctx-item" onClick={() => { setColAlign(a => ({ ...a, [colMenu.key]: 'right' })); close(); }}><AlignRight size={13} /> Align right</button>
            <div className="ctx-sep" />
            <button className="ctx-item" onClick={() => { setColWidths(prev => { const n = { ...prev }; delete n[colMenu.key]; return n; }); close(); }}><Columns3 size={13} /> Reset width</button>
            {!fixed && <button className="ctx-item" onClick={() => { setHiddenCols(prev => { const n = new Set(prev); n.add(colMenu.key); return n; }); close(); }}><Eye size={13} /> Hide column</button>}
            {isCustom && <button className="ctx-item danger" onClick={async () => { const id = parseInt(colMenu.key.slice(3), 10); if (confirm('Delete this custom column?')) { try { await store.api.deleteField(id); store.refetch(); } catch { /* noop */ } } close(); }}><Trash2 size={13} /> Delete column</button>}
            <div className="ctx-sep" />
            <button className="ctx-item" onClick={() => { setColMgrOpen(true); close(); }}><Columns3 size={13} /> Column manager…</button>
          </div>
        );
      })()}

      {ctxMenu && (() => {
        const ct = flat.find(r => r.t.id === ctxMenu.id)?.t;
        if (!ct) return null;
        const close = () => setCtxMenu(null);
        return (
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
            <button className="ctx-item" onClick={() => { addTask(ctxMenu.id); close(); }}><Plus size={13} /> Insert task below</button>
            <button className="ctx-item" onClick={() => { insertSummary(); close(); }}><FolderPlus size={13} /> Wrap in summary</button>
            <button className="ctx-item" onClick={() => { store.applyUpdate([ctxMenu.id], { is_milestone: !ct.is_milestone }); close(); }}>
              <Diamond size={13} /> {ct.is_milestone ? 'Convert to task' : 'Convert to milestone'}
            </button>
            <div className="ctx-sep" />
            <button className="ctx-item" onClick={() => { indent(ctxMenu.id); close(); }}><Indent size={13} /> Indent</button>
            <button className="ctx-item" onClick={() => { outdent(ctxMenu.id); close(); }}><Outdent size={13} /> Outdent</button>
            <div className="ctx-sep" />
            <button className="ctx-item" onClick={() => { setDrawerId(ctxMenu.id); close(); }}><Info size={13} /> Details, comments &amp; files…</button>
            <button className="ctx-item danger" onClick={() => { setSelectedIds(new Set([ctxMenu.id])); setPrimaryId(ctxMenu.id); setTimeout(deleteSelection, 0); close(); }}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        );
      })()}

      {store.toast && <div className={'toast' + (store.toast.error ? ' error' : '')}>{store.toast.msg}</div>}
    </div>
  );
}
