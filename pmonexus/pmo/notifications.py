"""
Email + Microsoft Teams notifications.

Both channels fail silently: a notification problem must never break a save.
Email uses Django's mail backend (console backend when SMTP isn't configured).
Teams posts a MessageCard to the Incoming Webhook in TEAMS_WEBHOOK_URL.
"""
import json
import logging
import urllib.request

from django.conf import settings
from django.core.mail import send_mail

log = logging.getLogger(__name__)


def _project_url(project_id):
    return f"{settings.APP_BASE_URL.rstrip('/')}/projects/{project_id}/"


def _email(to, subject, body):
    if not to:
        return
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=True)
    except Exception:  # noqa: BLE001 - never let notifications break a request
        log.warning("Email notification failed", exc_info=True)


def _teams(title, lines, link=None):
    url = settings.TEAMS_WEBHOOK_URL
    if not url:
        return
    card = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        "themeColor": "2563EB",
        "summary": title,
        "title": title,
        "text": "<br>".join(lines),
    }
    if link:
        card["potentialAction"] = [{
            "@type": "OpenUri", "name": "Open in PMONexus",
            "targets": [{"os": "default", "uri": link}],
        }]
    try:
        req = urllib.request.Request(
            url, data=json.dumps(card).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:  # noqa: BLE001
        log.warning("Teams notification failed", exc_info=True)


def notify_assignment(task, assignee, actor):
    """Fired when a task is assigned (or reassigned) to someone."""
    if assignee is None or (actor and assignee.id == actor.id):
        return  # no spam for self-assignment
    project = task.project
    due = ""
    if task.end_date:
        due = f"\nFinish date: {task.end_date.strftime('%d %b %Y')}"
    link = _project_url(project.id)
    _email(
        assignee.email,
        f"[{project.name}] You've been assigned: {task.title}",
        f"Hi {assignee.name},\n\n"
        f"{(actor.name if actor else 'Someone')} assigned you a task in {project.name}:\n\n"
        f"  {task.title}{due}\n\nOpen the plan: {link}\n",
    )
    _teams(
        f"Task assigned — {project.name}",
        [f"**{task.title}** was assigned to **{assignee.name}**"
         + (f" (finish {task.end_date.strftime('%d %b %Y')})" if task.end_date else "")],
        link,
    )


def notify_due_digest(user, rows):
    """rows: [(task, project, is_overdue)] for one assignee."""
    if not rows:
        return
    lines = []
    for task, project, overdue in rows:
        when = task.end_date.strftime('%d %b %Y') if task.end_date else "no date"
        flag = "OVERDUE" if overdue else "due soon"
        lines.append(f"  - [{flag}] {task.title} ({project.name}) — finish {when}")
    _email(
        user.email,
        f"PMONexus: {len(rows)} task(s) need your attention",
        f"Hi {user.name},\n\nThese tasks assigned to you are overdue or due soon:\n\n"
        + "\n".join(lines)
        + f"\n\nOpen PMONexus: {settings.APP_BASE_URL}\n",
    )


def notify_due_teams_summary(all_rows):
    """One channel post summarising everything that's overdue / due soon."""
    if not all_rows:
        return
    lines = []
    for task, project, assignee_name, overdue in all_rows[:20]:
        when = task.end_date.strftime('%d %b') if task.end_date else "?"
        lines.append(f"{'🔴' if overdue else '🟡'} **{task.title}** ({project.name}) — {assignee_name}, finish {when}")
    if len(all_rows) > 20:
        lines.append(f"…and {len(all_rows) - 20} more.")
    _teams(f"Daily schedule check: {len(all_rows)} task(s) overdue or due soon", lines,
           settings.APP_BASE_URL)
