from django.contrib import admin

from core import models


@admin.register(models.User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "azure_object_id", "created_at")
    search_fields = ("name", "email")


@admin.register(models.Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")


@admin.register(models.WorkspaceMember)
class WorkspaceMemberAdmin(admin.ModelAdmin):
    list_display = ("workspace", "user", "role")
    list_filter = ("role",)


@admin.register(models.Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ("name", "workspace", "owner")


@admin.register(models.Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "workspace", "status", "owner", "start_date", "end_date")
    list_filter = ("status", "workspace")
    search_fields = ("name",)


@admin.register(models.ProjectMember)
class ProjectMemberAdmin(admin.ModelAdmin):
    list_display = ("project", "user", "role", "is_external")
    list_filter = ("role", "is_external")


class TaskDependencyInline(admin.TabularInline):
    model = models.TaskDependency
    fk_name = "from_task"
    extra = 0


@admin.register(models.Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title", "project", "status", "progress", "start_date", "end_date", "is_milestone", "sort_order")
    list_filter = ("status", "project", "is_milestone")
    search_fields = ("title",)
    inlines = [TaskDependencyInline]


@admin.register(models.RaidItem)
class RaidItemAdmin(admin.ModelAdmin):
    list_display = ("title", "project", "type", "priority", "status", "owner", "due_date")
    list_filter = ("type", "priority", "status", "project")
    search_fields = ("title",)


@admin.register(models.TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ("user", "project", "task", "entry_date", "minutes", "type")
    list_filter = ("type", "project")


admin.site.register(models.PortfolioProject)
admin.site.register(models.TaskAttachment)
admin.site.register(models.CustomField)
admin.site.register(models.TaskCustomFieldValue)
admin.site.register(models.ProjectCalendar)
admin.site.register(models.CalendarHoliday)
