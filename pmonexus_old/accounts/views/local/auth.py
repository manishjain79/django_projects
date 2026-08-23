"""
Local stand-in for Azure App Service Easy Auth.

On Azure, App Service injects headers like X-MS-CLIENT-PRINCIPAL-NAME once Entra ID
sign-in has happened. There's no App Service locally, so nothing sets those headers -
we hardcode a fake signed-in user instead, the same way the Excel app hardcoded
header values for local testing.

Edit HARDCODED_USER below if you want to test as a different person/role locally.
"""

HARDCODED_USER = {
    "email": "local.dev@pmonexus.local",
    "name": "Local Dev User",
    "object_id": "local-dev-oid-0001",
}


def parse_user_headers(request):
    return dict(HARDCODED_USER)
