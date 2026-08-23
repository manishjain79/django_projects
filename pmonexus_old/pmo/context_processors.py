def pmo_user(request):
    return {
        "pmo_user": getattr(request, "pmo_user", None),
        "pmo_workspace": getattr(request, "pmo_workspace", None),
        "pmo_workspace_role": getattr(request, "pmo_workspace_role", None),
    }
