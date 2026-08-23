"""
Prod header parsing for Azure App Service "Easy Auth" (built-in Authentication /
Entra ID). App Service sits in front of the app and handles the whole OIDC login
flow itself - by the time a request reaches Django, the user is already signed in
and App Service has attached identity headers to the request:

  X-MS-CLIENT-PRINCIPAL-NAME  - the user's UPN/email
  X-MS-CLIENT-PRINCIPAL-ID    - the Entra object id
  X-MS-CLIENT-PRINCIPAL       - base64-encoded JSON with the full claims set

This means Django never talks to Entra ID directly and never needs a client
secret - App Service configuration owns that. Enable it with:

  az webapp auth update --resource-group pmonexus --name pmonexus \
      --enabled true --action LoginWithAzureActiveDirectory \
      --aad-client-id <APP_ID> --aad-tenant-id <TENANT_ID>
"""
import base64
import json


def parse_user_headers(request):
    principal_name = request.META.get("HTTP_X_MS_CLIENT_PRINCIPAL_NAME")
    principal_id = request.META.get("HTTP_X_MS_CLIENT_PRINCIPAL_ID")
    principal_b64 = request.META.get("HTTP_X_MS_CLIENT_PRINCIPAL")

    if not principal_name and not principal_b64:
        # No Easy Auth headers present - either auth isn't enabled on the App
        # Service yet, or the request bypassed it. Caller (middleware) decides
        # what to do (redirect to login).
        return None

    email = principal_name
    name = principal_name

    if principal_b64:
        try:
            decoded = base64.b64decode(principal_b64)
            claims = json.loads(decoded).get("claims", [])
            claim_map = {c.get("typ"): c.get("val") for c in claims}
            email = claim_map.get("preferred_username") or claim_map.get("emails") or principal_name
            name = claim_map.get("name") or principal_name
        except (ValueError, TypeError, json.JSONDecodeError):
            pass  # fall back to the plain headers above

    return {
        "email": email,
        "name": name,
        "object_id": principal_id,
    }
