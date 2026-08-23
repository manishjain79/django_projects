# PMONexus (Django rebuild)

A rebuild of the PMONexus PM/portfolio tool in Django, using the same local/prod
pattern as your Excel-to-DataTables app: `WEBSITE_HOSTNAME` in the environment
tells the app whether it's on Azure App Service or on your machine, and that one
flag drives auth, credentials, and debug settings everywhere.

## Stack
- Django 5 (templates + Django admin, no separate frontend framework)
- SQLite locally (zero setup) / PostgreSQL in prod via `DATABASE_URL`
- Auth: Azure App Service Easy Auth (Entra ID) in prod, hardcoded fake user locally
- Azure Blob Storage via `ManagedIdentityCredential` / `DefaultAzureCredential` - no keys
- Bootstrap + DataTables for tables (same as your Excel app), Frappe Gantt for the Gantt chart

## Run it locally

```bash
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# .env's defaults work out of the box - sqlite db, hardcoded local user, no Azure needed yet.

python manage.py migrate
python manage.py createsuperuser   # for /admin/
python manage.py seed              # optional: creates a demo project + tasks + RAID item

python manage.py runserver
```

Visit `http://127.0.0.1:8000/` - you'll be signed in automatically as
`local.dev@pmonexus.local` (see `accounts/views/local/auth.py`), with a workspace
auto-created on first request, same as the old NextAuth `signIn` callback used to do.

Visit `http://127.0.0.1:8000/admin/` (log in with the `createsuperuser` account)
to add/edit projects, tasks, RAID items - this replaces most of the custom
`UserManagementPanel.tsx` work for free.

## How local vs prod actually differs

| | Local | Prod (Azure App Service) |
|---|---|---|
| `WEBSITE_HOSTNAME` env var | absent | set automatically by App Service |
| Signed-in user | hardcoded in `accounts/views/local/auth.py` | read from Easy Auth headers in `accounts/views/prod/auth.py` |
| Azure credential | `DefaultAzureCredential()` (uses `az login`) | `ManagedIdentityCredential()` |
| Database | sqlite (`db.sqlite3`) | Postgres via `DATABASE_URL` app setting |
| `DEBUG` | on by default | off by default |

All of that branching lives in one place: `config/environment.py`'s
`is_running_on_azure()`. Everything else (`accounts/resolver.py`,
`storage/blob.py`, `config/settings.py`) just calls that function - same
shape as your `create_credential()` helper.

## Deploying to Azure App Service

```bash
az webapp config appsettings set \
  --resource-group pmonexus --name pmonexus \
  --settings \
    PMONEXUS_SECRET_KEY="<long random value>" \
    DATABASE_URL="postgresql://pmadmin:CHANGE_ME@YOURSERVER.postgres.database.azure.com:5432/pmonexus?sslmode=require" \
    AZURE_STORAGE_ACCOUNT_URL="https://YOURSTORAGEACCOUNT.blob.core.windows.net" \
    AZURE_STORAGE_CONTAINER="task-attachments" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true

# Enable built-in Entra ID auth (Easy Auth) - App Service handles the login
# flow entirely; Django only reads the resulting headers.
az webapp auth update \
  --resource-group pmonexus --name pmonexus \
  --enabled true --action LoginWithAzureActiveDirectory \
  --aad-client-id <APP_ID> --aad-tenant-id <TENANT_ID>

# Give the App Service's managed identity blob access (no keys needed):
az role assignment create \
  --assignee <APP_SERVICE_PRINCIPAL_ID> \
  --role "Storage Blob Data Contributor" \
  --scope <STORAGE_ACCOUNT_RESOURCE_ID>
```

Startup command on App Service: `gunicorn config.wsgi:application`

Then run migrations once against the prod database (from Cloud Shell or
locally with `DATABASE_URL` pointed at prod):
```bash
python manage.py migrate
```

## What's implemented vs still to build

**Working:** data model (Workspace/Portfolio/Project/Task/RAID/etc., matching
the original Prisma schema), Django admin for all of it, local/prod auth
switch, dashboard, project list, project detail with Gantt chart (drag/resize
cascades to dependent tasks via `pmo/scheduler.py`), RAID log view, team view,
seed command.

**Not yet built** (the original app had these too, via custom UI - worth
doing as Django admin customizations or extra views once the core is working):
CSV import/export, task attachments upload UI (the `storage/blob.py` helper
is ready, just needs a view wired to it), custom fields UI, time tracking UI,
portfolio summary rollups.

## Known limitation carried over from the original
`pmo/scheduler.py` (ported from `lib/scheduler.ts`) only cascades one hop of
dependents and always treats dependencies as finish-to-start, ignoring the
other `DependencyType` values and the project calendar's working days/holidays.
This was true in the original TypeScript version too - flagging it here so
it's a known gap, not a surprise.
