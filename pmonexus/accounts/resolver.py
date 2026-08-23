from config.environment import is_running_on_azure


def parse_user_headers(request):
    """
    Same branching pattern as create_credential() in the Excel app:
    check WEBSITE_HOSTNAME, then import the matching local/ or prod/ module.
    Returns a dict {"email", "name", "object_id"} or None if prod headers are
    missing (not yet signed in).
    """
    if is_running_on_azure():
        from accounts.views.prod.auth import parse_user_headers as _parse
    else:
        from accounts.views.local.auth import parse_user_headers as _parse
    return _parse(request)
