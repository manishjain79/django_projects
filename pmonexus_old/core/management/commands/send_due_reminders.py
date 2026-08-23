"""
Daily due-date reminders (run from cron / Azure WebJob / GitHub Action):

    python manage.py send_due_reminders --days 3

Emails each assignee a digest of their overdue and due-soon tasks, and posts
one summary card to the Teams channel webhook (TEAMS_WEBHOOK_URL) if set.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Task, TaskStatus
from pmo.notifications import notify_due_digest, notify_due_teams_summary


class Command(BaseCommand):
    help = "Email/Teams reminders for tasks that are overdue or due within --days."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=3,
                            help="Look-ahead window in days (default 3).")

    def handle(self, *args, **options):
        now = timezone.now()
        horizon = now + timedelta(days=options["days"])

        tasks = (Task.objects
                 .filter(end_date__lt=horizon, assignee__isnull=False)
                 .exclude(status=TaskStatus.DONE)
                 .select_related("assignee", "project"))
        # Skip summary tasks — only workable leaf tasks get reminders.
        parent_ids = set(Task.objects.filter(parent_task__isnull=False)
                         .values_list("parent_task_id", flat=True))

        by_user, all_rows = {}, []
        for t in tasks:
            if t.id in parent_ids:
                continue
            overdue = t.end_date < now
            by_user.setdefault(t.assignee, []).append((t, t.project, overdue))
            all_rows.append((t, t.project, t.assignee.name, overdue))

        for user, rows in by_user.items():
            rows.sort(key=lambda r: r[0].end_date)
            notify_due_digest(user, rows)

        all_rows.sort(key=lambda r: r[0].end_date)
        notify_due_teams_summary(all_rows)

        self.stdout.write(self.style.SUCCESS(
            f"Reminders: {len(all_rows)} task(s) across {len(by_user)} assignee(s)."
        ))
