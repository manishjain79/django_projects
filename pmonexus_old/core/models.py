from django.db import models


class WorkspaceRole(models.TextChoices):
    GLOBAL_ADMIN = "GLOBAL_ADMIN"
    MEMBER = "MEMBER"


class ProjectRole(models.TextChoices):
    OWNER = "OWNER"
    EDITOR = "EDITOR"
    VIEWER = "VIEWER"
    COMMENTOR = "COMMENTOR"


class ProjectStatus(models.TextChoices):
    PLANNING = "PLANNING"
    ACTIVE = "ACTIVE"
    ON_HOLD = "ON_HOLD"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class TaskStatus(models.TextChoices):
    # Values kept stable for existing data; labels follow MS Project.
    TODO = "TODO", "Not Started"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    BLOCKED = "BLOCKED", "On Hold"
    DONE = "DONE", "Complete"


class StatusCategory(models.TextChoices):
    """Buckets that custom statuses map to, so scheduling, %-complete and board
    grouping keep working no matter what the status is named."""
    NOT_STARTED = "NOT_STARTED", "Not Started"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    DONE = "DONE", "Complete"


class DependencyType(models.TextChoices):
    FINISH_TO_START = "FINISH_TO_START"
    START_TO_START = "START_TO_START"
    FINISH_TO_FINISH = "FINISH_TO_FINISH"
    START_TO_FINISH = "START_TO_FINISH"


class ConstraintType(models.TextChoices):
    # The full MS Project set of task constraints.
    ASAP = "ASAP", "As Soon As Possible"
    ALAP = "ALAP", "As Late As Possible"
    SNET = "SNET", "Start No Earlier Than"
    SNLT = "SNLT", "Start No Later Than"
    FNET = "FNET", "Finish No Earlier Than"
    FNLT = "FNLT", "Finish No Later Than"
    MSO = "MSO", "Must Start On"
    MFO = "MFO", "Must Finish On"


class Methodology(models.TextChoices):
    TRADITIONAL = "TRADITIONAL", "Waterfall / Gantt"
    AGILE = "AGILE", "Agile"
    HYBRID = "HYBRID", "Hybrid"


class TaskType(models.TextChoices):
    # How Work = Duration × Units is balanced when one value changes (MS Project).
    FIXED_UNITS = "FIXED_UNITS", "Fixed Units"
    FIXED_DURATION = "FIXED_DURATION", "Fixed Duration"
    FIXED_WORK = "FIXED_WORK", "Fixed Work"


class SchedulingMode(models.TextChoices):
    AUTO = "AUTO", "Auto Scheduled"
    MANUAL = "MANUAL", "Manually Scheduled"


class RaidType(models.TextChoices):
    RISK = "RISK"
    ASSUMPTION = "ASSUMPTION"
    ISSUE = "ISSUE"
    DEPENDENCY = "DEPENDENCY"


class RaidStatus(models.TextChoices):
    OPEN = "OPEN"
    MITIGATING = "MITIGATING"
    ON_HOLD = "ON_HOLD"
    CLOSED = "CLOSED"


class RaidPriority(models.TextChoices):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class CustomFieldType(models.TextChoices):
    TEXT = "TEXT"
    NUMBER = "NUMBER"
    DATE = "DATE"
    BOOLEAN = "BOOLEAN"
    SELECT = "SELECT"


class TimeEntryType(models.TextChoices):
    MANUAL = "MANUAL"
    TIMER = "TIMER"


class User(models.Model):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=255)
    azure_object_id = models.CharField(max_length=100, blank=True, null=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name or self.email


class Workspace(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class WorkspaceMember(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="workspace_memberships")
    role = models.CharField(max_length=20, choices=WorkspaceRole.choices, default=WorkspaceRole.MEMBER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("workspace", "user")


class ResourceProfile(models.Model):
    """Per-person capacity within a workspace: part-time units + PTO (time off).
    Used by the workload heatmap and the resource leveller."""
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="resource_profiles")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="resource_profiles")
    units = models.FloatField(default=1.0)  # 1.0 = 100% capacity, 0.5 = half-time
    rate = models.FloatField(default=0)     # standard cost per hour
    working_days_json = models.JSONField(blank=True, null=True)  # ISO weekdays 1=Mon..7=Sun; null = follow project calendar

    class Meta:
        unique_together = ("workspace", "user")

    def __str__(self):
        return f"{self.user_id}@{self.workspace_id} ({self.units})"


class ResourceTimeOff(models.Model):
    profile = models.ForeignKey(ResourceProfile, on_delete=models.CASCADE, related_name="time_off")
    start_date = models.DateField()
    end_date = models.DateField()
    note = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        ordering = ["start_date"]


class Portfolio(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="portfolios")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name="owned_portfolios")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Project(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=ProjectStatus.choices, default=ProjectStatus.PLANNING)
    methodology = models.CharField(max_length=20, choices=Methodology.choices, default=Methodology.TRADITIONAL)
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name="owned_projects")
    start_date = models.DateTimeField(blank=True, null=True)
    end_date = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class PortfolioProject(models.Model):
    portfolio = models.ForeignKey(Portfolio, on_delete=models.CASCADE, related_name="portfolio_projects")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="portfolios")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("portfolio", "project")


class ProjectMember(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="project_memberships")
    role = models.CharField(max_length=20, choices=ProjectRole.choices)
    is_external = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("project", "user")


class Sprint(models.Model):
    """An iteration/version for agile boards (like OpenProject versions)."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="sprints")
    name = models.CharField(max_length=255)
    start_date = models.DateTimeField(blank=True, null=True)
    end_date = models.DateTimeField(blank=True, null=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.name


class Task(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    parent_task = models.ForeignKey("self", on_delete=models.CASCADE, blank=True, null=True, related_name="subtasks")
    sprint = models.ForeignKey(Sprint, on_delete=models.SET_NULL, blank=True, null=True, related_name="tasks")
    assignee = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name="assigned_tasks")
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=40, default=TaskStatus.TODO)
    progress = models.IntegerField(default=0)
    start_date = models.DateTimeField(blank=True, null=True)
    end_date = models.DateTimeField(blank=True, null=True)
    sort_order = models.IntegerField(default=0)
    is_milestone = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)               # inactive = what-if, excluded from rollups/scheduling
    task_type = models.CharField(max_length=20, choices=TaskType.choices, default=TaskType.FIXED_UNITS)
    effort_driven = models.BooleanField(default=False)
    scheduling_mode = models.CharField(max_length=10, choices=SchedulingMode.choices, default=SchedulingMode.AUTO)
    fixed_cost = models.FloatField(default=0)
    constraint_type = models.CharField(max_length=10, choices=ConstraintType.choices, default=ConstraintType.ASAP)
    constraint_date = models.DateTimeField(blank=True, null=True)
    deadline = models.DateTimeField(blank=True, null=True)
    estimated_hours = models.FloatField(blank=True, null=True)   # work/effort
    story_points = models.IntegerField(blank=True, null=True)    # agile estimation
    baseline_start = models.DateTimeField(blank=True, null=True)
    baseline_end = models.DateTimeField(blank=True, null=True)
    format_json = models.JSONField(blank=True, null=True)  # {"bold":true,"italic":false,"color":"#dc2626"}
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.title


class TaskAssignment(models.Model):
    """Resource assignment — a task can have one or many (MS Project style),
    each with units (1.0 = 100%)."""
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="assignments")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="task_assignments")
    units = models.FloatField(default=1.0)

    class Meta:
        unique_together = ("task", "user")


class TaskDependency(models.Model):
    from_task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="outgoing_deps")
    to_task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="incoming_deps")
    type = models.CharField(max_length=25, choices=DependencyType.choices, default=DependencyType.FINISH_TO_START)
    lag_days = models.IntegerField(default=0)  # working days; negative = lead (e.g. 2FS-1)

    class Meta:
        unique_together = ("from_task", "to_task", "type")


class TaskComment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="task_comments")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class TaskAttachment(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="attachments")
    file_name = models.CharField(max_length=500)
    blob_url = models.URLField(max_length=1000)
    mime_type = models.CharField(max_length=150, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class CustomField(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="custom_fields")
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=CustomFieldType.choices)
    options_json = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class TaskCustomFieldValue(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="custom_values")
    custom_field = models.ForeignKey(CustomField, on_delete=models.CASCADE, related_name="values")
    value = models.TextField()

    class Meta:
        unique_together = ("task", "custom_field")


class WorkflowStatus(models.Model):
    """A user-definable task status for a project. Replaces the fixed defaults —
    each carries a stable `key` (stored on Task.status), a display name, a colour
    and a category so the scheduler/board/roll-ups keep working."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="statuses")
    key = models.CharField(max_length=40)
    name = models.CharField(max_length=60)
    category = models.CharField(max_length=20, choices=StatusCategory.choices, default=StatusCategory.NOT_STARTED)
    color = models.CharField(max_length=9, default="#94a3b8")
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        unique_together = ("project", "key")

    def __str__(self):
        return f"{self.project_id}:{self.name}"


class Baseline(models.Model):
    """A named snapshot of the plan's dates/progress (MS Project multi-baseline).
    Stored as JSON keyed by task id to keep it cheap: {"<task_id>": {start,end,progress}}."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="baselines")
    name = models.CharField(max_length=80)
    created_at = models.DateTimeField(auto_now_add=True)
    snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.project_id}:{self.name}"


class RaidItem(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="raid_items")
    type = models.CharField(max_length=20, choices=RaidType.choices)
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, null=True)
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name="owned_raid_items")
    priority = models.CharField(max_length=20, choices=RaidPriority.choices, default=RaidPriority.MEDIUM)
    status = models.CharField(max_length=20, choices=RaidStatus.choices, default=RaidStatus.OPEN)
    due_date = models.DateTimeField(blank=True, null=True)
    mitigation_plan = models.TextField(blank=True, null=True)
    resolution_note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class ProjectCalendar(models.Model):
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name="calendar")
    time_zone = models.CharField(max_length=100, default="Asia/Singapore")
    working_days_json = models.JSONField(default=list)  # e.g. [1,2,3,4,5]
    work_start_hour = models.IntegerField(default=9)
    work_end_hour = models.IntegerField(default=18)


class CalendarHoliday(models.Model):
    calendar = models.ForeignKey(ProjectCalendar, on_delete=models.CASCADE, related_name="holidays")
    name = models.CharField(max_length=255)
    date = models.DateTimeField()


class TimeEntry(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="time_entries")
    task = models.ForeignKey(Task, on_delete=models.SET_NULL, blank=True, null=True, related_name="time_entries")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="time_entries")
    entry_date = models.DateTimeField()
    minutes = models.IntegerField()
    note = models.TextField(blank=True, null=True)
    type = models.CharField(max_length=20, choices=TimeEntryType.choices, default=TimeEntryType.MANUAL)
    created_at = models.DateTimeField(auto_now_add=True)
