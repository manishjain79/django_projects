"""
Calendar-aware auto-scheduling engine (MS Project-style), v3.

- Durations and lags are expressed in *working days* per the project calendar
  (working_days_json ISO weekdays 1=Mon..7=Sun, plus CalendarHoliday dates).
- All four dependency types (FS/SS/FF/SF) with lag/lead (lag_days, negative = lead).
- Two-way auto-scheduling: a successor's start is recomputed from ALL of its
  predecessors (the latest requirement wins), so it moves earlier as well as
  later when predecessors shift — like MS Project's auto-scheduled tasks.
- Constraint types: ASAP (default), SNET (Start No Earlier Than) and
  MSO (Must Start On, pinned).
"""
from datetime import datetime, time, timedelta

from django.utils import timezone

from core.models import ConstraintType, DependencyType, ProjectCalendar, SchedulingMode, Task, TaskDependency

DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]  # Mon-Fri


# ---------------------------------------------------------------------------
# Project calendar helpers
# ---------------------------------------------------------------------------

def get_calendar(project):
    cal = ProjectCalendar.objects.filter(project=project).prefetch_related("holidays").first()
    if cal is None:
        return set(DEFAULT_WORKING_DAYS), set()
    working = set(cal.working_days_json or DEFAULT_WORKING_DAYS)
    holidays = {timezone.localtime(h.date).date() for h in cal.holidays.all()}
    return working, holidays


def is_working_day(d, cal):
    working, holidays = cal
    return d.isoweekday() in working and d not in holidays


def next_working_day(d, cal):
    for _ in range(731):
        if is_working_day(d, cal):
            return d
        d += timedelta(days=1)
    return d


def prev_working_day(d, cal):
    for _ in range(731):
        if is_working_day(d, cal):
            return d
        d -= timedelta(days=1)
    return d


def shift_working_days(d, n, cal):
    """Move n working days from d (negative = backwards). d is snapped first."""
    d = next_working_day(d, cal) if n >= 0 else prev_working_day(d, cal)
    step = 1 if n >= 0 else -1
    for _ in range(abs(n)):
        d += timedelta(days=step)
        d = next_working_day(d, cal) if step > 0 else prev_working_day(d, cal)
    return d


def add_working_days(start, n, cal):
    """End date of a task starting on/after `start` lasting n working days."""
    n = max(1, n)
    d = next_working_day(start, cal)
    counted = 1
    while counted < n:
        d = next_working_day(d + timedelta(days=1), cal)
        counted += 1
    return d


def start_for_end(end, duration, cal):
    """Latest start so a task of `duration` working days finishes on `end`."""
    d = prev_working_day(end, cal)
    counted = 1
    while counted < duration:
        d = prev_working_day(d - timedelta(days=1), cal)
        counted += 1
    return d


def count_working_days(a, b, cal):
    if b < a:
        return 0
    n, d = 0, a
    while d <= b:
        if is_working_day(d, cal):
            n += 1
        d += timedelta(days=1)
    return max(1, n)


def local_date(dt):
    return timezone.localtime(dt).date() if dt else None


def to_start_dt(d):
    return timezone.make_aware(datetime.combine(d, time(9, 0)))


def to_end_dt(d):
    return timezone.make_aware(datetime.combine(d, time(17, 0)))


# ---------------------------------------------------------------------------
# Constraint / dependency resolution
# ---------------------------------------------------------------------------

def required_start_for(task, cal, dates):
    """
    The start date auto-scheduling wants for `task`, derived from every
    predecessor (max requirement), then adjusted for the task's constraint.
    Returns None when the task has no predecessors and no constraint
    (i.e. the user's manual start stands).
    `dates` maps task_id -> (start_date, end_date) for already-moved tasks.
    """
    duration = None
    if task.start_date and task.end_date:
        duration = count_working_days(local_date(task.start_date), local_date(task.end_date), cal)

    candidates = []
    for dep in TaskDependency.objects.filter(to_task=task).select_related("from_task"):
        pred = dep.from_task
        p_start, p_end = dates.get(pred.id, (pred.start_date, pred.end_date))
        if not p_start or not p_end:
            continue
        ps, pe = local_date(p_start), local_date(p_end)
        lag = dep.lag_days or 0

        if dep.type == DependencyType.START_TO_START:
            base = shift_working_days(ps, lag, cal)
        elif dep.type == DependencyType.FINISH_TO_FINISH:
            end_req = shift_working_days(pe, lag, cal)
            base = start_for_end(end_req, duration or 1, cal)
        elif dep.type == DependencyType.START_TO_FINISH:
            end_req = shift_working_days(ps, lag, cal)
            base = start_for_end(end_req, duration or 1, cal)
        else:  # FINISH_TO_START
            base = shift_working_days(pe, 1 + lag, cal)
        candidates.append(base)

    required = max(candidates) if candidates else None

    # Constraints (full MS Project semantics)
    ct = task.constraint_type
    cdate = local_date(task.constraint_date) if task.constraint_date else None
    dur = duration or 1
    if cdate:
        if ct == ConstraintType.MSO:                       # Must Start On — pin start
            return next_working_day(cdate, cal)
        if ct == ConstraintType.MFO:                       # Must Finish On — pin finish
            return start_for_end(prev_working_day(cdate, cal), dur, cal)
        if ct == ConstraintType.SNET:                      # Start No Earlier Than
            snet = next_working_day(cdate, cal)
            required = max(required, snet) if required else snet
        elif ct == ConstraintType.FNET:                    # Finish No Earlier Than
            fnet_start = start_for_end(prev_working_day(cdate, cal), dur, cal)
            required = max(required, fnet_start) if required else fnet_start
        # SNLT / FNLT ("no later than") are ceilings — they never pull a task
        # earlier in a forward pass; the inspector surfaces them as warnings.

    return required


def reschedule_task_and_successors(task_id, next_start, next_end):
    """
    Persist new dates for task_id, then walk the successor graph recomputing
    each auto-scheduled successor's start from ALL of its predecessors and
    constraints — moving it earlier or later as needed, preserving its
    working-day duration. Pinned (MSO) tasks don't move; their successors
    are still visited. Cycle-safe.
    """
    task = Task.objects.select_related("project").get(id=task_id)
    cal = get_calendar(task.project)

    # A pinned task dragged by the user gets its pin moved with it.
    if task.constraint_type == ConstraintType.MSO:
        Task.objects.filter(id=task_id).update(
            start_date=next_start, end_date=next_end, constraint_date=next_start
        )
    elif task.constraint_type == ConstraintType.MFO:
        Task.objects.filter(id=task_id).update(
            start_date=next_start, end_date=next_end, constraint_date=next_end
        )
    else:
        Task.objects.filter(id=task_id).update(start_date=next_start, end_date=next_end)

    dates = {task_id: (next_start, next_end)}
    visited = {task_id}
    queue = [task_id]

    while queue:
        current_id = queue.pop(0)
        for dep in TaskDependency.objects.filter(from_task_id=current_id).select_related("to_task"):
            succ = dep.to_task
            if succ.id in visited:
                continue
            visited.add(succ.id)
            if not succ.start_date or not succ.end_date:
                queue.append(succ.id)
                continue

            s_start, s_end = local_date(succ.start_date), local_date(succ.end_date)
            duration = count_working_days(s_start, s_end, cal)
            required = required_start_for(succ, cal, dates)

            # Manually-scheduled or inactive tasks are never auto-moved.
            if (required is None or required == s_start
                    or succ.constraint_type in (ConstraintType.MSO, ConstraintType.MFO)
                    or succ.scheduling_mode == SchedulingMode.MANUAL
                    or not succ.is_active):
                queue.append(succ.id)
                continue

            new_start = required
            new_end = add_working_days(new_start, duration, cal)
            sd, ed = to_start_dt(new_start), to_end_dt(new_end)
            Task.objects.filter(id=succ.id).update(start_date=sd, end_date=ed)
            dates[succ.id] = (sd, ed)
            queue.append(succ.id)
