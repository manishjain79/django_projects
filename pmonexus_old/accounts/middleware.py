from django.shortcuts import redirect

from accounts.resolver import parse_user_headers
from core.models import User, Workspace, WorkspaceMember, WorkspaceRole
from config.environment import is_running_on_azure

# Paths that must stay reachable without a signed-in user (Easy Auth's own
# login/callback routes, static files, the Django admin's own login page).
EXEMPT_PREFIXES = ("/.auth/", "/static/", "/admin/login/")


class PmoAuthMiddleware:
    """
    Runs on every request. Resolves who's signed in (real Entra ID headers in
    prod, hardcoded fake user locally - see accounts/resolver.py), then makes
    sure a matching core.User row exists and belongs to a Workspace, creating
    both on first login. This replaces the signIn()/jwt()/session() callbacks
    from the old NextAuth config - same logic, just living in Django instead.
    Attaches the result as request.pmo_user for views/templates to use.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith(EXEMPT_PREFIXES):
            return self.get_response(request)

        header_info = parse_user_headers(request)

        if header_info is None:
            # Prod, Easy Auth enabled, but no identity headers on this request -
            # user hasn't signed in yet. Send them to the App Service login endpoint.
            if is_running_on_azure():
                return redirect("/.auth/login/aad?post_login_redirect_uri=" + request.path)
            # Local mode always returns a hardcoded user, so this shouldn't happen -
            # but fail safe rather than crash.
            request.pmo_user = None
            return self.get_response(request)

        user, _ = User.objects.get_or_create(
            email=header_info["email"],
            defaults={
                "name": header_info.get("name") or header_info["email"],
                "azure_object_id": header_info.get("object_id"),
            },
        )

        membership = WorkspaceMember.objects.filter(user=user).select_related("workspace").first()
        if membership is None:
            workspace = Workspace.objects.create(name=f"{user.name}'s Workspace")
            membership = WorkspaceMember.objects.create(
                workspace=workspace, user=user, role=WorkspaceRole.GLOBAL_ADMIN
            )

        request.pmo_user = user
        request.pmo_workspace = membership.workspace
        request.pmo_workspace_role = membership.role

        return self.get_response(request)
