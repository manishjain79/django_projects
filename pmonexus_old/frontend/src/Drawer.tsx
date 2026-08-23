import React from 'react';
import type { Store } from './store';
import type { StatusDef } from './types';
import { D, makeWorkday } from './util';

const HPD = 8;   // working hours per day (Work = Duration × 8 × Units)

interface Props {
  store: Store;
  taskId: number | null;
  onClose: () => void;
  statuses: StatusDef[];
  agile: boolean;
}

const CONSTRAINTS: [string, string][] = [
  ['ASAP', 'As Soon As Possible'],
  ['ALAP', 'As Late As Possible'],
  ['SNET', 'Start No Earlier Than'],
  ['SNLT', 'Start No Later Than'],
  ['FNET', 'Finish No Earlier Than'],
  ['FNLT', 'Finish No Later Than'],
  ['MSO', 'Must Start On'],
  ['MFO', 'Must Finish On'],
];

export function Drawer({ store, taskId, onClose, statuses, agile }: Props) {
  const data = store.data;
  const t = data?.tasks.find(x => x.id === taskId) ?? null;
  const up = (fields: Record<string, unknown>) => t && store.applyUpdate([t.id], fields);

  const [logHours, setLogHours] = React.useState('');
  const [logNote, setLogNote] = React.useState('');
  const [commentBody, setCommentBody] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  if (!t || !data) return <div id="drawer" className={taskId ? 'open' : ''} />;

  const field = (label: string, node: React.ReactNode) => (
    <div><label className="dw-label">{label}</label>{node}</div>
  );

  // Effort-driven scheduling helpers: Work = Duration × 8h × Units.
  const wd = makeWorkday(data.calendar);
  const unitsSum = (() => {
    const asg = t.assignees && t.assignees.length ? t.assignees : (t.assignee ? [{ units: 1 }] : []);
    const u = asg.reduce((s, a) => s + ((a as { units?: number }).units ?? 1), 0);
    return u > 0 ? u : 1;
  })();
  const durDays = (t.start && t.end) ? wd.count(D(t.start), D(t.end)) : '';

  return (
    <div id="drawer" className="open">
      <div className="dw-head">
        <h3>Task details</h3>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="dw-body">
        {field('Name', <input key={t.title} defaultValue={t.title} onBlur={e => e.target.value.trim() && up({ title: e.target.value.trim() })} />)}
        {field('Description', <textarea key={t.description} rows={4} defaultValue={t.description}
          placeholder="Describe this task…" onBlur={e => up({ description: e.target.value })} />)}
        <div className="dw-grid2">
          {field('Start', <input key={t.start ?? ''} type="date" defaultValue={t.start ?? ''} onChange={e => e.target.value && up({ start_date: e.target.value })} />)}
          {field('Finish', <input key={t.end ?? ''} type="date" defaultValue={t.end ?? ''} onChange={e => e.target.value && up({ end_date: e.target.value })} />)}
        </div>
        <div className="dw-grid2">
          {field('Status', <select key={t.status} defaultValue={t.status} onChange={e => up({ status: e.target.value })}>
            {statuses.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>)}
          {field('Progress %', <input key={t.progress} type="number" min={0} max={100} defaultValue={t.progress}
            onChange={e => up({ progress: parseInt(e.target.value, 10) || 0 })} />)}
        </div>
        {field('Assignment / Resources (units %)', (() => {
          const cur = t.assignees && t.assignees.length ? t.assignees : (t.assignee ? [{ id: t.assignee.id, name: t.assignee.name, units: 1 }] : []);
          const setAssign = (list: { user_id: number; units: number }[]) => {
            const fields: Record<string, unknown> = { assignments: list };
            // Effort-driven: adding/removing resources keeps Work fixed and shrinks/grows Duration.
            if (t.effort_driven && t.estimated_hours) {
              const u = list.reduce((s, a) => s + (a.units || 1), 0) || 1;
              fields.duration = Math.max(1, Math.round(t.estimated_hours / (HPD * u)));
            }
            up(fields);
          };
          return (
            <div className="dw-assign">
              {data.members.map(m => {
                const a = cur.find(x => x.id === m.id);
                const checked = !!a;
                return (
                  <label key={m.id} className={'dw-assign-row' + (checked ? ' on' : '')}>
                    <input type="checkbox" checked={checked} onChange={e => {
                      const base = cur.map(x => ({ user_id: x.id, units: x.units }));
                      const next = e.target.checked ? [...base, { user_id: m.id, units: 1 }] : base.filter(x => x.user_id !== m.id);
                      setAssign(next);
                    }} />
                    <span>{m.name}</span>
                    {checked && <input className="dw-units" type="number" min={0} max={500} step={10} title="Units %"
                      value={Math.round((a!.units || 1) * 100)}
                      onMouseDown={e => e.stopPropagation()}
                      onChange={e => setAssign(cur.map(x => ({ user_id: x.id, units: x.id === m.id ? (parseInt(e.target.value, 10) || 0) / 100 : x.units })))} />}
                  </label>
                );
              })}
              {data.members.length === 0 && <p className="dw-muted">No workspace members yet.</p>}
            </div>
          );
        })())}
        {agile && (
          <div className="dw-grid2">
            {field('Sprint', <select key={t.sprint_id ?? ''} defaultValue={t.sprint_id ? String(t.sprint_id) : ''}
              onChange={e => up({ sprint_id: e.target.value ? parseInt(e.target.value, 10) : null })}>
              <option value="">Backlog (no sprint)</option>
              {data.sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>)}
            {field('Story points', <input key={t.story_points ?? ''} type="number" min={0} defaultValue={t.story_points ?? ''}
              onChange={e => up({ story_points: e.target.value || null })} />)}
          </div>
        )}
        <div className="dw-grid2">
          {field('Constraint', <select key={t.constraint_type} defaultValue={t.constraint_type}
            onChange={e => up({ constraint_type: e.target.value })}>
            {CONSTRAINTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>)}
          {field('Constraint date', <input key={t.constraint_date ?? ''} type="date" defaultValue={t.constraint_date ?? ''}
            disabled={t.constraint_type === 'ASAP' || t.constraint_type === 'ALAP'}
            onChange={e => up({ constraint_date: e.target.value || null })} />)}
        </div>
        <div className="dw-grid3">
          {field('Duration (d)', <input key={'dur' + durDays} type="number" min={1} defaultValue={durDays} disabled={t.is_milestone}
            onBlur={e => {
              const d = parseInt(e.target.value, 10);
              if (!d || d < 1) return;
              const fields: Record<string, unknown> = { duration: d };
              if (t.task_type !== 'FIXED_WORK') fields.estimated_hours = d * HPD * unitsSum;   // Work follows Duration
              up(fields);
            }} />)}
          {field('Work (h)', <input key={'wk' + (t.estimated_hours ?? '')} type="number" min={0} step={0.5} defaultValue={t.estimated_hours ?? ''}
            onBlur={e => {
              const w = e.target.value ? parseFloat(e.target.value) : null;
              const fields: Record<string, unknown> = { estimated_hours: w };
              if (w && t.task_type !== 'FIXED_DURATION') fields.duration = Math.max(1, Math.round(w / (HPD * unitsSum)));   // Duration follows Work
              up(fields);
            }} />)}
          {field('Deadline', <input key={t.deadline ?? ''} type="date" defaultValue={t.deadline ?? ''} onChange={e => up({ deadline: e.target.value || null })} />)}
        </div>
        <div className="dw-grid2">
          {field('Task type', <select key={t.task_type || 'FIXED_UNITS'} defaultValue={t.task_type || 'FIXED_UNITS'} onChange={e => up({ task_type: e.target.value })}>
            <option value="FIXED_UNITS">Fixed Units</option>
            <option value="FIXED_DURATION">Fixed Duration</option>
            <option value="FIXED_WORK">Fixed Work</option>
          </select>)}
          {field('Scheduling', <select key={t.scheduling_mode || 'AUTO'} defaultValue={t.scheduling_mode || 'AUTO'} onChange={e => up({ scheduling_mode: e.target.value })}>
            <option value="AUTO">Auto scheduled</option>
            <option value="MANUAL">Manually scheduled</option>
          </select>)}
        </div>
        <div className="dw-grid2">
          {field('Fixed cost', <input key={t.fixed_cost ?? 0} type="number" min={0} step={10} defaultValue={t.fixed_cost ?? 0} onBlur={e => up({ fixed_cost: e.target.value || 0 })} />)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            <label className="dw-check"><input type="checkbox" checked={t.effort_driven ?? false} onChange={e => up({ effort_driven: e.target.checked })} /> Effort driven</label>
            <label className="dw-check"><input type="checkbox" checked={t.is_active !== false} onChange={e => up({ is_active: e.target.checked })} /> Active (uncheck for what-if)</label>
          </div>
        </div>
        <label className="dw-check">
          <input type="checkbox" checked={t.is_milestone} onChange={e => up({ is_milestone: e.target.checked })} /> Milestone
        </label>
        <p className="dw-muted">{t.baseline_start ? `Baseline: ${t.baseline_start} → ${t.baseline_end}` : 'No baseline set yet.'}</p>

        <div className="dw-section">
          <label className="dw-label">Time logged: <b>{((t.logged_minutes || 0) / 60).toFixed(1)}h</b></label>
          <div className="dw-row">
            <input type="number" min={0.25} step={0.25} placeholder="Hours" style={{ width: 90 }}
              value={logHours} onChange={e => setLogHours(e.target.value)} />
            <input placeholder="Note (optional)" value={logNote} onChange={e => setLogNote(e.target.value)} />
            <button className="dw-btn" onClick={async () => {
              const h = parseFloat(logHours);
              if (!h || h <= 0) { store.say('Enter hours to log', true); return; }
              try { await store.api.logTime(t.id, Math.round(h * 60), logNote); } catch (e) { store.say((e as Error).message, true); return; }
              setLogHours(''); setLogNote('');
              store.refetch();
            }}>Log</button>
          </div>
        </div>

        <div className="dw-section">
          <div className="dw-row-between">
            <label className="dw-label">Attachments</label>
            <span className="dw-att-actions">
              <button className="dw-link" onClick={() => fileRef.current?.click()}>Upload file</button>
              <button className="dw-link" onClick={async () => {
                const name = prompt('Link name (e.g. Requirements in SharePoint):');
                if (!name?.trim()) return;
                const url = prompt('Link URL (SharePoint / Teams / web):');
                if (!url?.trim()) return;
                try { await store.api.addAttachment(t.id, name.trim(), url.trim()); store.refetch(); }
                catch (e) { store.say((e as Error).message, true); }
              }}>+ Add link</button>
            </span>
          </div>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try { await store.api.uploadAttachment(t.id, f); store.say(`Uploaded ${f.name}`); store.refetch(); }
            catch (err) { store.say((err as Error).message, true); }
          }} />
          <p className="dw-muted" style={{ marginTop: 2 }}>Attach a file — Word, PDF, image, or an email (.eml / .msg) — or paste a link.</p>
          {(t.attachments || []).length === 0 && <p className="dw-muted">No attachments.</p>}
          {(t.attachments || []).map(a => (
            <div key={a.id} className="dw-chip">
              <a href={a.url} target="_blank" rel="noreferrer" title={a.mime || ''}>
                <span className={'att-kind ' + (a.kind || 'link')}>{a.kind === 'file' ? 'FILE' : 'LINK'}</span>{a.name}
              </a>
              <button onClick={async () => { try { await store.api.deleteAttachment(t.id, a.id); store.refetch(); } catch { /* noop */ } }}>✕</button>
            </div>
          ))}
        </div>

        <div className="dw-section">
          <label className="dw-label">Comments</label>
          <div className="dw-comments">
            {(t.comments || []).length === 0 && <p className="dw-muted">No comments yet.</p>}
            {(t.comments || []).map(c => (
              <div key={c.id} className="dw-comment">
                <p className="dw-comment-head">{c.user} <span>· {c.at}</span></p>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
          <div className="dw-row">
            <input placeholder="Write a comment…" value={commentBody} onChange={e => setCommentBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (document.getElementById('dw-post') as HTMLButtonElement)?.click(); }} />
            <button id="dw-post" className="dw-btn primary" onClick={async () => {
              if (!commentBody.trim()) return;
              try { await store.api.addComment(t.id, commentBody.trim()); setCommentBody(''); store.refetch(); }
              catch (e) { store.say((e as Error).message, true); }
            }}>Post</button>
          </div>
        </div>

        <div className="dw-section">
          <label className="dw-label">Custom fields</label>
          {data.custom_fields.length === 0 && <p className="dw-muted">No custom fields for this project.</p>}
          {data.custom_fields.map(f => {
            const val = t.custom_values?.[String(f.id)] || '';
            return (
              <div key={f.id} className="dw-row">
                <span className="dw-field-name">{f.name}</span>
                {f.type === 'SELECT'
                  ? <select key={val} defaultValue={val} onChange={e => up({ custom_values: { [f.id]: e.target.value } })}>
                      <option value="" />
                      {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  : f.type === 'BOOLEAN'
                    ? <input type="checkbox" checked={val === 'true'} onChange={e => up({ custom_values: { [f.id]: e.target.checked ? 'true' : 'false' } })} />
                    : <input key={val} type={f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text'}
                        defaultValue={val} onBlur={e => up({ custom_values: { [f.id]: e.target.value } })} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
