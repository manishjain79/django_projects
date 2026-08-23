import React, { useRef } from 'react';
import type { CondRule, FlatRow, Member, StatusDef, Task } from './types';
import type { Store } from './store';
import { D, makeWorkday, parsePreds, predText } from './util';

export interface ColDef { key: string; label: string; w: number; fixed?: boolean; custom?: { id: number; name: string; type: string; options?: string[] } }

interface Props {
  store: Store;
  flat: FlatRow[];
  cols: ColDef[];
  colWidths: Record<string, number>;
  setColWidth: (key: string, w: number) => void;
  selectedIds: Set<number>;
  primaryId: number | null;
  onSelect: (id: number, e: React.MouseEvent) => void;
  collapsed: Set<number>;
  toggleCollapse: (id: number) => void;
  statuses: StatusDef[];
  members: Member[];
  slack: Map<number, { total: number; free: number }>;
  groupBy: 'none' | 'resource' | 'status' | 'phase';
  filterRowOn: boolean;
  colFilters: Record<string, string>;
  onColFilter: (key: string, val: string) => void;
  colAlign: Record<string, 'left' | 'center' | 'right'>;
  condFormat: boolean;
  condRules: CondRule[];
  selectedCol: string | null;
  selectedCols: Set<string>;
  onColSelect: (key: string, e: React.MouseEvent) => void;
  onColMenu: (key: string, x: number, y: number) => void;
  onAddTask: (afterId?: number) => void;
  onIndent: (id: number) => void;
  onOutdent: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenDrawer: (id: number) => void;
  onDropRow: (draggedId: number, targetId: number) => void;
  onHoverRow: (row: number | null) => void;
  onReorderCols: (fromKey: string, toKey: string) => void;
  onAddColumn: () => void;
  onContextMenu?: (id: number, x: number, y: number) => void;
}

/** Uncontrolled input that commits on blur/Enter; remounts when value changes externally. */
function Cell({ value, disabled, align, commit, style, onKeyDown }: {
  value: string; disabled?: boolean; align?: string; style?: React.CSSProperties;
  commit: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      disabled={disabled}
      style={{ textAlign: align as 'left', ...style }}
      spellCheck={false}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        else if (e.key === 'Escape') { (e.target as HTMLInputElement).value = value; (e.target as HTMLInputElement).blur(); }
        onKeyDown?.(e);
      }}
      onBlur={e => { if (e.target.value !== value) commit(e.target.value); }}
    />
  );
}

function DateCell({ value, disabled, commit }: { value: string | null; disabled?: boolean; commit: (v: string) => void }) {
  return (
    <input key={value ?? ''} type="date" defaultValue={value ?? ''} disabled={disabled}
      onChange={e => { if (e.target.value && e.target.value !== value) commit(e.target.value); }} />
  );
}

export function Grid(p: Props) {
  const dragId = useRef<number | null>(null);
  const dragCol = useRef<string | null>(null);
  const cal = p.store.data!.calendar;
  const wd = makeWorkday(cal);
  const wbsOf = (id: number) => p.flat.find(r => r.t.id === id)?.wbs ?? null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const matchRule = (rule: CondRule, t: Task): boolean => {
    switch (rule.field) {
      case 'status': return t.status === rule.value;
      case 'milestone': return !!t.is_milestone === (rule.value !== 'false');
      case 'overdue': { const od = !!(t.end && t.end < todayIso && (t.progress || 0) < 100); return od === (rule.value !== 'false'); }
      case 'progress': { const v = parseInt(rule.value, 10) || 0; const pr = t.progress || 0; return rule.op === 'lt' ? pr < v : rule.op === 'gt' ? pr > v : pr === v; }
      case 'assignee': return !!(t.assignees?.some(a => String(a.id) === rule.value)) || String(t.assignee?.id) === rule.value;
      default: return false;
    }
  };

  const cellFor = (c: ColDef, r: FlatRow): React.ReactNode => {
    const t = r.t;
    const up = (fields: Record<string, unknown>) => p.store.applyUpdate([t.id], fields);
    switch (c.key) {
      case 'wbs':
        return (
          <td className="wbs" draggable title="Drag to reorder"
            onDragStart={e => { dragId.current = t.id; e.dataTransfer.effectAllowed = 'move'; }}>
            {r.wbs}
          </td>
        );
      case 'name': {
        const f = t.format || {};
        return (
          <td>
            <div className="name-cell" style={{ paddingLeft: r.level * 18 + 4 }}>
              <span className={'twisty' + (r.isSummary ? ' has-kids' : '')}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); if (r.isSummary) p.toggleCollapse(t.id); }}
                title={r.isSummary ? (p.collapsed.has(t.id) ? 'Expand' : 'Collapse') : undefined}>
                {r.isSummary ? (p.collapsed.has(t.id) ? '▸' : '▾') : ''}
              </span>
              {t.is_milestone && <span className="ms-flag">◆</span>}
              <Cell value={t.title}
                style={{
                  fontWeight: f.bold ? 700 : undefined, fontStyle: f.italic ? 'italic' : undefined,
                  color: f.color || undefined, fontFamily: f.family || undefined,
                  fontSize: f.size ? `${f.size}px` : undefined,
                }}
                commit={v => { if (v.trim()) up({ title: v.trim() }); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') p.onAddTask(t.id);
                  else if (e.key === 'Tab') { e.preventDefault(); (e.target as HTMLInputElement).blur(); e.shiftKey ? p.onOutdent(t.id) : p.onIndent(t.id); }
                }}
              />
            </div>
          </td>
        );
      }
      case 'dur': {
        const dur = r.start && r.end ? wd.count(D(r.start), D(r.end)) : '';
        return (
          <td><Cell align="center" disabled={r.isSummary || t.is_milestone}
            value={t.is_milestone ? '0d' : dur !== '' ? `${dur}d` : ''}
            commit={v => { const n = parseInt(v, 10); if (!isNaN(n) && n >= 1) up({ duration: n }); }} /></td>
        );
      }
      case 'start': return <td><DateCell value={r.start} disabled={r.isSummary} commit={v => up({ start_date: v })} /></td>;
      case 'end': return <td><DateCell value={r.end} disabled={r.isSummary || t.is_milestone} commit={v => up({ end_date: v })} /></td>;
      case 'pred':
        return (
          <td><Cell align="center" value={predText(t, wbsOf)}
            commit={v => {
              try { up({ predecessors: parsePreds(v, p.flat) }); }
              catch (err) { p.store.say((err as Error).message, true); }
            }} /></td>
        );
      case 'resource': {
        const names = (t.assignees && t.assignees.length
          ? t.assignees.map(a => a.name)
          : (t.assignee ? [t.assignee.name] : [])).join(', ');
        return (
          <td title="Type one or more resource names separated by commas (e.g. Alice, Bob)"><Cell value={names} disabled={r.isSummary}
            commit={v => {
              const wanted = v.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
              const ids: number[] = [];
              const unknown: string[] = [];
              for (const nm of wanted) {
                const m = p.members.find(x => x.name.toLowerCase() === nm);
                if (m) { if (!ids.includes(m.id)) ids.push(m.id); } else unknown.push(nm);
              }
              if (unknown.length) p.store.say(`Not a workspace member: ${unknown.join(', ')}`, true);
              up({ assignee_ids: ids });
            }} /></td>
        );
      }
      case 'progress':
        return (
          <td><Cell align="center" disabled={r.isSummary} value={String(r.progress)}
            commit={v => { const n = parseInt(v, 10); if (!isNaN(n)) up({ progress: n }); }} /></td>
        );
      case 'status': {
        const sd = p.statuses.find(s => s.key === t.status);
        return (
          <td className="status-cell" style={{ ['--st-color' as string]: sd?.color || '#cbd5e1' }}>
            <span className="status-dot" style={{ background: sd?.color || '#cbd5e1' }} />
            <select key={t.status} defaultValue={t.status} disabled={r.isSummary}
              onChange={e => up({ status: e.target.value })}>
              {p.statuses.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </td>
        );
      }
      case 'sprint':
        return (
          <td>
            <select key={t.sprint_id ?? ''} defaultValue={t.sprint_id != null ? String(t.sprint_id) : ''} disabled={r.isSummary}
              onChange={e => up({ sprint_id: e.target.value ? parseInt(e.target.value, 10) : null })}>
              <option value="">Backlog</option>
              {(p.store.data!.sprints || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </td>
        );
      case 'description':
        return <td><Cell value={t.description || ''} disabled={r.isSummary} commit={v => up({ description: v })} /></td>;
      case 'deadline': return <td><DateCell value={t.deadline} disabled={r.isSummary} commit={v => up({ deadline: v })} /></td>;
      case 'work':
        return <td><Cell align="center" disabled={r.isSummary} value={t.estimated_hours != null ? String(t.estimated_hours) : ''} commit={v => up({ estimated_hours: v || null })} /></td>;
      case 'points':
        return <td><Cell align="center" disabled={r.isSummary} value={t.story_points != null ? String(t.story_points) : ''} commit={v => up({ story_points: v || null })} /></td>;
      case 'total_slack': {
        if (r.isSummary || t.is_milestone) return <td className="static-cell" style={{ textAlign: 'center' }}>—</td>;
        const s = p.slack.get(t.id);
        const v = s ? s.total : null;
        return <td className={'static-cell' + (v != null && v < 0 ? ' bad' : '')} style={{ textAlign: 'center' }}
          title={v != null && v < 0 ? 'Negative slack — a deadline/constraint is being breached' : undefined}>
          {v == null ? '—' : `${v}d`}</td>;
      }
      case 'free_slack': {
        if (r.isSummary || t.is_milestone) return <td className="static-cell" style={{ textAlign: 'center' }}>—</td>;
        const s = p.slack.get(t.id);
        return <td className="static-cell" style={{ textAlign: 'center' }}>{s ? `${s.free}d` : '—'}</td>;
      }
      case 'baseline_start': return <td className="static-cell">{t.baseline_start || '—'}</td>;
      case 'baseline_end': return <td className="static-cell">{t.baseline_end || '—'}</td>;
      case 'actions':
        return (
          <td style={{ textAlign: 'center' }}>
            <span className="row-action" title="Details, comments & attachments" onClick={() => p.onOpenDrawer(t.id)}>ⓘ</span>
            <span className="row-action del" title="Delete" onClick={() => p.onDelete(t.id)}>✕</span>
          </td>
        );
      default:
        if (c.custom) {
          const f = c.custom;
          const val = t.custom_values?.[String(f.id)] || '';
          if (f.type === 'SELECT') {
            return (
              <td>
                <select key={val} defaultValue={val} onChange={e => up({ custom_values: { [f.id]: e.target.value } })}>
                  <option value="" />
                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
            );
          }
          if (f.type === 'DATE') return <td><DateCell value={val || null} commit={v => up({ custom_values: { [f.id]: v } })} /></td>;
          if (f.type === 'BOOLEAN') {
            return <td style={{ textAlign: 'center' }}><input type="checkbox" checked={val === 'true'}
              onChange={e => up({ custom_values: { [f.id]: e.target.checked ? 'true' : 'false' } })} /></td>;
          }
          return <td><Cell align={f.type === 'NUMBER' ? 'center' : undefined} value={val} commit={v => up({ custom_values: { [f.id]: v } })} /></td>;
        }
        return <td />;
    }
  };

  const reorderable = (key: string) => key !== 'actions' && key !== 'wbs';

  return (
    <table id="task-grid">
      <colgroup>
        {p.cols.map(c => <col key={c.key} className={p.selectedCols.has(c.key) ? 'col-sel' : undefined} style={{ width: (p.colWidths[c.key] || c.w) + 'px' }} />)}
        <col style={{ width: '120px' }} />
      </colgroup>
      <thead>
        <tr>
          {p.cols.map(c => (
            <th key={c.key}
              draggable={reorderable(c.key)}
              title="Click to select this column · drag to move · right-click for options"
              data-align={p.colAlign[c.key] || undefined}
              className={p.selectedCols.has(c.key) ? 'col-sel-th' : undefined}
              style={c.key === 'name' ? { textAlign: 'left', paddingLeft: '.5rem' } : undefined}
              onClick={e => { if (!(e.target as HTMLElement).classList.contains('col-resizer')) p.onColSelect(c.key, e); }}
              onContextMenu={e => { e.preventDefault(); p.onColMenu(c.key, e.clientX, e.clientY); }}
              onDragStart={e => { dragCol.current = c.key; e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => { if (dragCol.current && reorderable(c.key)) e.preventDefault(); }}
              onDrop={e => {
                e.preventDefault();
                if (dragCol.current && dragCol.current !== c.key && reorderable(c.key)) p.onReorderCols(dragCol.current, c.key);
                dragCol.current = null;
              }}>
              {c.label}
              <div className="col-resizer"
                onMouseDown={e => {
                  e.preventDefault();
                  const startX = e.clientX, startW = p.colWidths[c.key] || c.w;
                  const move = (ev: MouseEvent) => p.setColWidth(c.key, Math.max(36, startW + ev.clientX - startX));
                  const upH = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', upH); };
                  document.addEventListener('mousemove', move);
                  document.addEventListener('mouseup', upH);
                }} />
            </th>
          ))}
          <th className="add-col" onClick={p.onAddColumn} title="Create a custom column (like MS Project's Add New Column)">
            + Add New Column
          </th>
        </tr>
        {p.filterRowOn && (
          <tr className="filter-row">
            {p.cols.map(c => (
              <th key={c.key}>
                {c.key !== 'actions' && c.key !== 'wbs'
                  ? <input value={p.colFilters[c.key] || ''} placeholder="Filter…" spellCheck={false}
                      onChange={e => p.onColFilter(c.key, e.target.value)} />
                  : null}
              </th>
            ))}
            <th />
          </tr>
        )}
      </thead>
      <tbody>
        {p.groupBy === 'none' ? p.flat.map(renderRow) : groupBands()}
        <tr className="add-row" onClick={() => p.onAddTask()}>
          <td /><td colSpan={p.cols.length}>Click here to add a new task…</td>
        </tr>
      </tbody>
    </table>
  );

  function renderRow(r: FlatRow): React.ReactNode {
          const t = r.t;
          const f = t.format || {};
          let condBg: string | undefined, condFg: string | undefined;
          if (p.condFormat) {
            if (p.condRules.length) {
              for (const rule of p.condRules) {
                if (matchRule(rule, t)) { if (rule.bg) condBg = rule.bg; if (rule.color) condFg = rule.color; if (rule.bg || rule.color) break; }
              }
            } else {
              const sd = p.statuses.find(s => s.key === t.status); if (sd) condBg = sd.color + '22';
            }
          }
          const rowBg = f.bg || condBg;
          const rowFg = f.color || condFg;
          const rowStyle: Record<string, string> = {};
          if (rowBg) rowStyle['--row-bg'] = rowBg;
          if (rowFg) rowStyle['--row-fg'] = rowFg;
          if (f.family) rowStyle['--row-ff'] = f.family;
          if (f.size) rowStyle['--row-fs'] = f.size + 'px';
          if (f.bold) rowStyle['--row-fw'] = '700';
          if (f.italic) rowStyle['--row-fi'] = 'italic';
          return (
            <tr key={t.id}
              className={[p.selectedIds.has(t.id) ? 'selected' : '', r.isSummary ? 'summary' : '', t.is_active === false ? 'inactive' : ''].join(' ')}
              data-valign={f.valign || undefined}
              style={rowStyle as React.CSSProperties}
              onMouseDown={e => {
                // Modifier clicks are selection gestures — stop the underlying
                // input from stealing focus / starting a text selection.
                if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault();
                p.onSelect(t.id, e);
              }}
              onMouseEnter={() => p.onHoverRow(r.row)}
              onMouseLeave={() => p.onHoverRow(null)}
              onContextMenu={e => { if (p.onContextMenu) { e.preventDefault(); p.onContextMenu(t.id, e.clientX, e.clientY); } }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (dragId.current) p.onDropRow(dragId.current, t.id); dragId.current = null; }}>
              {p.cols.map(c => {
                const cell = cellFor(c, r);
                const ta = p.colAlign[c.key];
                return ta && React.isValidElement(cell)
                  ? React.cloneElement(cell as React.ReactElement<{ 'data-align'?: string }>, { key: c.key, 'data-align': ta })
                  : <React.Fragment key={c.key}>{cell}</React.Fragment>;
              })}
              <td className="add-col-cell" />
            </tr>
          );
  }

  /** Groups leaf rows by the chosen key and renders each group under a band header. */
  function groupBands(): React.ReactNode {
    const tasksById = new Map(p.store.data!.tasks.map(t => [t.id, t]));
    const phaseOf = (t: Task): string => {
      let cur = t;
      while (cur.parent_id != null && tasksById.has(cur.parent_id)) cur = tasksById.get(cur.parent_id)!;
      return cur.id === t.id ? '(No phase)' : cur.title;
    };
    const labelOf = (t: Task): string => {
      if (p.groupBy === 'resource') {
        const names = (t.assignees && t.assignees.length)
          ? t.assignees.map(a => a.name).join(', ')
          : (t.assignee?.name || '');
        return names || '(Unassigned)';
      }
      if (p.groupBy === 'status') {
        return p.statuses.find(s => s.key === t.status)?.name || t.status || '(No status)';
      }
      return phaseOf(t);
    };
    const groups = new Map<string, FlatRow[]>();
    for (const r of p.flat) {
      if (r.isSummary) continue;               // outline summaries are replaced by group bands
      const k = labelOf(r.t);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const entries = [...groups.entries()].sort((a, b) => {
      if (a[0].startsWith('(') !== b[0].startsWith('(')) return a[0].startsWith('(') ? 1 : -1;
      return a[0].localeCompare(b[0]);
    });
    const span = p.cols.length + 1;
    return entries.map(([label, rows]) => {
      const avg = rows.length ? Math.round(rows.reduce((s, r) => s + (r.progress || 0), 0) / rows.length) : 0;
      return (
        <React.Fragment key={'grp-' + label}>
          <tr className="group-band">
            <td className="group-band-cell" colSpan={span}>
              <span className="gb-label">{label}</span>
              <span className="gb-count">{rows.length}</span>
              <span className="gb-prog">{avg}% avg</span>
            </td>
          </tr>
          {rows.map(renderRow)}
        </React.Fragment>
      );
    });
  }
}
