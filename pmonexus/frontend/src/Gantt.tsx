import React, { useMemo, useRef } from 'react';
import type { FlatRow } from './types';
import type { Store } from './store';
import { D, addDays, computeCritical, diffDays, iso, makeWorkday } from './util';

const ROW_H = 36, HDR_H = 44;

interface Props {
  store: Store;
  flat: FlatRow[];
  dayWidth: number;
  showCritical: boolean;
  onSelect: (id: number) => void;
  onOpenDrawer: (id: number) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  todayXRef: React.MutableRefObject<number>;
  hoverRow: number | null;
  onHoverRow: (row: number | null) => void;
  xOfRef: React.MutableRefObject<(id: number) => number | null>;
  critColor: string;
  statusColorOf?: (key: string) => string | undefined;
  progressLine?: boolean;
}

export function Gantt(p: Props) {
  const data = p.store.data!;
  const wd = useMemo(() => makeWorkday(data.calendar), [data.calendar]);
  const crit = useMemo(
    () => (p.showCritical ? computeCritical(data.tasks, data.calendar) : new Set<number>()),
    [p.showCritical, data.tasks, data.calendar],
  );
  const drag = useRef<{ id: number; edge: string | null; startX: number; days: number } | null>(null);

  let min: Date | null = null, max: Date | null = null;
  for (const r of p.flat) {
    if (r.start && (!min || D(r.start)! < min)) min = D(r.start);
    if (r.end && (!max || D(r.end)! > max)) max = D(r.end);
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!min) { min = addDays(today, -3); max = addDays(today, 25); }
  if (!max || max < min) max = addDays(min, 25);
  const start = addDays(min, -4);
  const days = diffDays(start, addDays(max, 15)) + 1;
  const W = days * p.dayWidth;
  const H = HDR_H + (p.flat.length + 1) * ROW_H;
  const x = (isoDate: string) => diffDays(start, D(isoDate)!) * p.dayWidth;
  const rowY = (row: number) => HDR_H + row * ROW_H;
  const rowByIdMap = new Map(p.flat.map(r => [r.t.id, r]));
  p.todayXRef.current = diffDays(start, today) * p.dayWidth;
  p.xOfRef.current = (id: number) => {
    const r = rowByIdMap.get(id);
    return r && r.start ? x(r.start) : null;
  };

  const startDrag = (e: React.PointerEvent, r: FlatRow, edge: string | null) => {
    e.preventDefault();
    p.onSelect(r.t.id);
    drag.current = { id: r.t.id, edge, startX: e.clientX, days: 0 };
    const g = e.currentTarget as SVGGElement;
    g.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      drag.current.days = Math.round((ev.clientX - drag.current.startX) / p.dayWidth);
      if (!drag.current.edge) g.setAttribute('transform', `translate(${drag.current.days * p.dayWidth},0)`);
    };
    const up = () => {
      g.removeEventListener('pointermove', move as never);
      g.removeEventListener('pointerup', up as never);
      const d = drag.current;
      drag.current = null;
      g.removeAttribute('transform');
      if (!d || d.days === 0 || !r.start || !r.end) return;
      let s = D(r.start)!, en = D(r.end)!;
      if (!d.edge) { s = addDays(s, d.days); en = addDays(en, d.days); }
      else if (d.edge === 'left') { s = addDays(s, d.days); if (s > en) s = en; }
      else { en = addDays(en, d.days); if (en < s) en = s; }
      p.store.applyUpdate([r.t.id], { start_date: iso(s), end_date: iso(en) });
    };
    g.addEventListener('pointermove', move as never);
    g.addEventListener('pointerup', up as never);
  };

  const headerCells: React.ReactNode[] = [];
  const shading: React.ReactNode[] = [];
  let monthAt = -1e9;
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const px = i * p.dayWidth;
    if (!wd.isWork(d)) {
      shading.push(<rect key={'s' + i} x={px} y={HDR_H} width={p.dayWidth} height={H - HDR_H}
        fill={wd.isHoliday(d) ? '#fee2e2' : '#f1f5f9'} opacity={wd.isHoliday(d) ? 0.55 : 1} />);
    }
    if (p.dayWidth >= 18) {
      headerCells.push(<text key={'d' + i} x={px + p.dayWidth / 2} y={HDR_H - 8} textAnchor="middle" fontSize={10}
        fill={wd.isHoliday(d) ? '#dc2626' : '#94a3b8'}>{d.getDate()}</text>);
    } else if (d.getDay() === 1) {
      headerCells.push(<text key={'d' + i} x={px + 2} y={HDR_H - 8} fontSize={10} fill="#94a3b8">{d.getDate()}</text>);
    }
    if (d.getDate() === 1 || i === 0) {
      if (px > monthAt) {
        headerCells.push(<text key={'m' + i} x={px + 4} y={15} fontSize={11} fontWeight={600} fill="#475569">
          {d.toLocaleString('en', { month: 'short', year: 'numeric' })}</text>);
        monthAt = px + 70;
      }
      shading.push(<line key={'ml' + i} x1={px} y1={0} x2={px} y2={H} stroke="#e2e8f0" />);
    }
  }

  return (
    <svg id="gantt-svg" width={W} height={H} xmlns="http://www.w3.org/2000/svg">
      <rect x={0} y={0} width={W} height={HDR_H} fill="#f8fafc" />
      {shading}
      {headerCells}
      {p.hoverRow !== null && p.hoverRow < p.flat.length && (
        <rect x={0} y={rowY(p.hoverRow)} width={W} height={ROW_H} fill="#2563eb" opacity={0.06} />
      )}
      {p.flat.map((_, i) => <line key={'r' + i} x1={0} y1={rowY(i)} x2={W} y2={rowY(i)} stroke="#f1f5f9" />)}
      {/* hover-tracking bands (invisible, keep grid + gantt rows in sync) */}
      {p.flat.map((r, i) => (
        <rect key={'hb' + i} x={0} y={rowY(i)} width={W} height={ROW_H} fill="transparent"
          onMouseEnter={() => p.onHoverRow(i)} onMouseLeave={() => p.onHoverRow(null)} />
      ))}
      {p.todayXRef.current >= 0 && p.todayXRef.current <= W && (
        <g>
          <line x1={p.todayXRef.current} y1={HDR_H} x2={p.todayXRef.current} y2={H}
            stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" />
          <rect x={p.todayXRef.current - 19} y={HDR_H - 42} width={38} height={14} rx={7} fill="#f59e0b" />
          <text x={p.todayXRef.current} y={HDR_H - 32} textAnchor="middle" fontSize={9} fontWeight={600} fill="#fff">TODAY</text>
        </g>
      )}

      {/* progress line — zigzags left of the status date for behind tasks, right for ahead */}
      {p.progressLine && p.todayXRef.current >= 0 && p.todayXRef.current <= W && (() => {
        const sx = p.todayXRef.current;
        const pts: string[] = [`${sx},${HDR_H}`];
        p.flat.forEach((r, i) => {
          if (!r.start || !r.end || r.isSummary || r.t.is_milestone) return;
          const bx = x(r.start);
          const bw = Math.max(p.dayWidth, (diffDays(D(r.start)!, D(r.end)!) + 1) * p.dayWidth);
          const prog = Math.max(0, Math.min(100, r.progress || 0));
          pts.push(`${bx + (prog / 100) * bw},${rowY(i) + ROW_H / 2}`);
        });
        pts.push(`${sx},${H}`);
        return <polyline points={pts.join(' ')} fill="none" stroke="#dc2626" strokeWidth={1.5} opacity={0.9} />;
      })()}

      {/* dependency arrows */}
      {p.flat.flatMap(r => (r.t.predecessors || []).map((pr, j) => {
        const from = rowByIdMap.get(pr.id);
        if (!from || !from.start || !from.end || !r.start || !r.end) return null;
        const fx = pr.type === 'SS' || pr.type === 'SF' ? x(from.start) : x(from.end) + p.dayWidth;
        const fy = rowY(from.row) + ROW_H / 2;
        const txx = pr.type === 'FF' || pr.type === 'SF' ? x(r.end) + p.dayWidth + 4 : x(r.start);
        const ty = rowY(r.row) + ROW_H / 2;
        const mid = fx + 8;
        return (
          <g key={`dep-${r.t.id}-${j}`}>
            <path d={`M ${fx} ${fy} L ${mid} ${fy} L ${mid} ${ty} L ${txx - 4} ${ty}`} fill="none" stroke="#94a3b8" strokeWidth={1.2} />
            <path d={`M ${txx - 4} ${ty - 3.5} L ${txx + 1} ${ty} L ${txx - 4} ${ty + 3.5} Z`} fill="#94a3b8" />
          </g>
        );
      }))}

      {/* bars */}
      {p.flat.map(r => {
        if (!r.start || !r.end) return null;
        const t = r.t;
        const bx = x(r.start);
        const bw = Math.max(p.dayWidth, (diffDays(D(r.start)!, D(r.end)!) + 1) * p.dayWidth);
        const cy = rowY(r.row) + ROW_H / 2;
        const isCrit = crit.has(t.id);
        const label = (
          <text x={bx + bw + 6} y={cy + 3.5} fontSize={10}
            fill={t.format?.color || '#94a3b8'} fontWeight={t.format?.bold ? 700 : undefined}>
            {t.title.slice(0, 40)}
          </text>
        );
        const baseline = t.baseline_start && t.baseline_end && !r.isSummary && (
          <rect x={x(t.baseline_start)} y={cy + 9}
            width={Math.max(4, (diffDays(D(t.baseline_start)!, D(t.baseline_end)!) + 1) * p.dayWidth)}
            height={4} rx={2} fill="#cbd5e1" />
        );
        const deadline = t.deadline && !r.isSummary && (() => {
          const dx = x(t.deadline) + p.dayWidth;
          const late = r.end! > t.deadline!;
          return <path d={`M ${dx} ${cy - 10} L ${dx + 5} ${cy - 3} L ${dx + 1.5} ${cy - 3} L ${dx + 1.5} ${cy + 8} L ${dx - 1.5} ${cy + 8} L ${dx - 1.5} ${cy - 3} L ${dx - 5} ${cy - 3} Z`}
            fill={late ? '#dc2626' : '#16a34a'} />;
        })();

        if (t.is_milestone && !r.isSummary) {
          const s = 7, cx = bx + p.dayWidth / 2;
          return (
            <g key={t.id}>
              {baseline}
              <g className="bar" onPointerDown={e => startDrag(e, r, null)} onDoubleClick={() => p.onOpenDrawer(t.id)}>
                <path d={`M ${cx} ${cy - s} L ${cx + s} ${cy} L ${cx} ${cy + s} L ${cx - s} ${cy} Z`} fill={isCrit ? p.critColor : '#0f172a'} />
              </g>
              <text x={cx + s + 6} y={cy + 3.5} fontSize={10} fill="#64748b">{t.title.slice(0, 40)}</text>
              {deadline}
            </g>
          );
        }
        if (r.isSummary) {
          return (
            <g key={t.id}>
              <path d={`M ${bx} ${cy + 5} L ${bx} ${cy - 3} L ${bx + bw} ${cy - 3} L ${bx + bw} ${cy + 5} L ${bx + bw - 5} ${cy - 0.5} L ${bx + 5} ${cy - 0.5} Z`} fill="#334155" />
            </g>
          );
        }
        const sc = !isCrit ? p.statusColorOf?.(t.status) : undefined;
        const inactive = t.is_active === false;
        const manual = t.scheduling_mode === 'MANUAL';
        const trackFill = inactive ? '#f1f5f9' : (isCrit ? p.critColor : (sc || '#bfdbfe'));
        const progFill = inactive ? '#cbd5e1' : (isCrit ? p.critColor : (sc || '#2563eb'));
        const rx = manual ? 0 : 4;
        return (
          <g key={t.id} opacity={inactive ? 0.6 : 1}>
            {baseline}
            <g className="bar" onPointerDown={e => startDrag(e, r, (e.target as SVGElement).dataset.edge || null)}
              onDoubleClick={() => p.onOpenDrawer(t.id)}>
              <rect x={bx} y={cy - 8} width={bw} height={16} rx={rx} fill={trackFill}
                opacity={isCrit ? 0.35 : (sc ? 0.32 : 1)}
                stroke={manual ? '#475569' : 'none'} strokeDasharray={manual ? '3 2' : undefined} />
              <rect x={bx} y={cy - 8} width={Math.max(0, (bw * r.progress) / 100)} height={16} rx={rx} fill={progFill} />
              <rect x={bx - 3} y={cy - 8} width={7} height={16} className="bar-handle" data-edge="left" />
              <rect x={bx + bw - 4} y={cy - 8} width={7} height={16} className="bar-handle" data-edge="right" />
            </g>
            {inactive
              ? <text x={bx + bw + 6} y={cy + 3.5} fontSize={10} fill="#94a3b8" textDecoration="line-through">{t.title.slice(0, 40)}</text>
              : label}
            {deadline}
          </g>
        );
      })}
    </svg>
  );
}
