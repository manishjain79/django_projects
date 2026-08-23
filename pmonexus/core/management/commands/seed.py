from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import (
    Project, ProjectMember, ProjectRole, ProjectStatus,
    RaidItem, RaidPriority, RaidType,
    Task, TaskDependency, TaskStatus,
    User, Workspace, WorkspaceMember, WorkspaceRole,
)


class Command(BaseCommand):
    help = "Creates a demo workspace, project, tasks, dependencies and RAID items."

    def handle(self, *args, **options):
        user, _ = User.objects.get_or_create(
            email="local.dev@pmonexus.local",
            defaults={"name": "Local Dev User"},
        )
        workspace, _ = Workspace.objects.get_or_create(name="Local Dev's Workspace")
        WorkspaceMember.objects.get_or_create(
            workspace=workspace, user=user, defaults={"role": WorkspaceRole.GLOBAL_ADMIN}
        )

        project, _ = Project.objects.get_or_create(
            workspace=workspace,
            name="Website Relaunch",
            defaults={
                "description": "Demo project seeded for local testing.",
                "status": ProjectStatus.ACTIVE,
                "owner": user,
                "start_date": timezone.now(),
                "end_date": timezone.now() + timedelta(days=60),
            },
        )
        ProjectMember.objects.get_or_create(project=project, user=user, defaults={"role": ProjectRole.OWNER})

        today = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0)
        t1, _ = Task.objects.get_or_create(
            project=project, title="Discovery",
            defaults={"status": TaskStatus.DONE, "progress": 100,
                      "start_date": today, "end_date": today + timedelta(days=4), "sort_order": 0},
        )
        t2, _ = Task.objects.get_or_create(
            project=project, title="Design",
            defaults={"status": TaskStatus.IN_PROGRESS, "progress": 50,
                      "start_date": today + timedelta(days=5), "end_date": today + timedelta(days=12), "sort_order": 1},
        )
        t3, _ = Task.objects.get_or_create(
            project=project, title="Build",
            defaults={"status": TaskStatus.TODO, "progress": 0,
                      "start_date": today + timedelta(days=13), "end_date": today + timedelta(days=30), "sort_order": 2},
        )
        TaskDependency.objects.get_or_create(from_task=t1, to_task=t2)
        TaskDependency.objects.get_or_create(from_task=t2, to_task=t3)

        RaidItem.objects.get_or_create(
            project=project, type=RaidType.RISK, title="Vendor delay on CMS licence",
            defaults={"priority": RaidPriority.HIGH, "owner": user},
        )

        self.stdout.write(self.style.SUCCESS("Seed complete: 1 workspace, 1 project, 3 tasks, 1 RAID item."))
