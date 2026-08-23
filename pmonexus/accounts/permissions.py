from django.core.exceptions import PermissionDenied

from core.models import ProjectMember, WorkspaceRole


def require_project_role(request, project_id, allowed_roles):
    """
    Equivalent of requireProjectRole() from lib/auth.ts. allowed_roles is a list
    that may contain "GLOBAL_ADMIN" and/or ProjectRole values (as strings).
    Raises PermissionDenied (-> Django's built-in 403 page) if the current user
    doesn't qualify.
    """
    workspace_role = getattr(request, "pmo_workspace_role", None)
    if workspace_role == WorkspaceRole.GLOBAL_ADMIN and "GLOBAL_ADMIN" in allowed_roles:
        return True

    user = getattr(request, "pmo_user", None)
    membership = ProjectMember.objects.filter(project_id=project_id, user=user).first()
    if membership is None or membership.role not in allowed_roles:
        raise PermissionDenied("You don't have access to this project.")
    return True
