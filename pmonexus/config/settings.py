import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

from config.environment import is_running_on_azure

BASE_DIR = Path(__file__).resolve().parent.parent

# .env is only read locally. On Azure App Service you set these as Application
# Settings instead (az webapp config appsettings set ...) - load_dotenv() is a
# no-op there since there's no .env file deployed.
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("PMONEXUS_SECRET_KEY", "dev-only-secret-change-me")

# Debug defaults to on locally, off on Azure - override with DJANGO_DEBUG if needed.
DEBUG = os.environ.get("DJANGO_DEBUG", str(not is_running_on_azure())).lower() == "true"

# If running in production (DEBUG=False) and using the default secret, crash early on startup!
if not DEBUG and SECRET_KEY == "dev-only-secret-change-me":
    raise ImproperlyConfigured("PMONEXUS_SECRET_KEY environment variable is not set in production!")


# 1. Fetch custom domains from environment variable 
# Looks for a variable named 'CUSTOM_DOMAINS', defaults to an empty string if missing
custom_domains_env = os.environ.get("CUSTOM_DOMAINS", "")

# Splits a comma-separated string like "mycompany.com,://mycompany.com" into a clean list
custom_domains_list = [domain.strip() for domain in custom_domains_env.split(",") if domain.strip()]

# 2. Configure ALLOWED_HOSTS
ALLOWED_HOSTS = ["*"] if DEBUG else [
    os.environ.get("WEBSITE_HOSTNAME", "localhost"),
    ".azurewebsites.net",
] + custom_domains_list


# 3. Configure CSRF_TRUSTED_ORIGINS
if DEBUG:
    # Allows testing local servers friction-free
    CSRF_TRUSTED_ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000"]
else:
    # Production origins MUST include the https:// scheme
    azure_host = os.environ.get("WEBSITE_HOSTNAME")
    
    # Base origins: default Azure URLs
    CSRF_TRUSTED_ORIGINS = [
        "https://*.azurewebsites.net"
    ]
    if azure_host:
        CSRF_TRUSTED_ORIGINS.append(f"https://{azure_host}")
    
    # Dynamic addition: add your custom domains with proper schemes
    for domain in custom_domains_list:
        # If your list has ".mycompany.com", it becomes "https://*.mycompany.com"
        if domain.startswith("."):
            CSRF_TRUSTED_ORIGINS.append(f"https://*{domain}")
        else:
            CSRF_TRUSTED_ORIGINS.append(f"https://{domain}")
            # Also auto-add its 'www' subdomain for safety
            CSRF_TRUSTED_ORIGINS.append(f"https://*.{domain}")
    # Enable the following settings when you deploy azure application gateway in front of your app
    # # 1. Trust the gateway's SSL header
    # SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    # # 2. Enforce site-wide HTTPS redirects
    # SECURE_SSL_REDIRECT = True
    # # 3. Trust the proxy host headers
    # USE_X_FORWARDED_HOST = True
    # # 4. Lock down cookies to HTTPS only
    # SESSION_COOKIE_SECURE = True
    # CSRF_COOKIE_SECURE = True



INSTALLED_APPS = [
    # Core Django built-in apps
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Custom local apps built for this project
    "core",
    "accounts",
    "pmo",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware", # MUST go directly below SecurityMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Reads the Easy Auth headers (prod) or fake headers (local), finds-or-creates
    # the matching User + Workspace, attaches request.pmo_user. See accounts/middleware.py.
    "accounts.middleware.PmoAuthMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "pmo.context_processors.pmo_user",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Falls back to sqlite with zero config so `python manage.py runserver` works
# immediately on a fresh clone. Set DATABASE_URL to point at Azure Postgres in prod.
_database_url = os.environ.get("DATABASE_URL", "").strip()
if _database_url:
    DATABASES = {
        "default": dj_database_url.parse(
            _database_url, 
            conn_max_age=600,
            conn_health_checks=True  # Recommended for Django 4.1+ to prevent dead connections
            )
            }
    # Force SSL configurations specifically for Azure managed databases
    if "postgresql" in _database_url or "postgres" in _database_url:
        DATABASES["default"]["OPTIONS"] = {"sslmode": "require"}
    elif "mysql" in _database_url:
        DATABASES["default"]["OPTIONS"] = {"ssl": {"ssl_mode": "REQUIRED"}}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = []  # not used - login is via Entra ID / App Service Easy Auth, not passwords

# Cache: used for the planner's presence heartbeat + plan-revision check. With
# LocMemCache (the default) each gunicorn worker has its own private cache, so
# presence data won't be consistent once you run more than one worker. Set
# REDIS_URL (e.g. Azure Cache for Redis) in production to fix that; falls back
# to LocMemCache automatically if it's not set, so this is safe to deploy as-is.
_redis_url = os.environ.get("REDIS_URL", "").strip()
if _redis_url:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _redis_url,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Singapore"
USE_I18N = True
USE_TZ = True

# STATIC FILES PATHS
STATIC_URL = "static/"
# This is where Django will collect all files for WhiteNoise to serve
STATIC_ROOT = BASE_DIR / "staticfiles"
# Extra places where you keep asset files (like your main global CSS/JS folders)
STATICFILES_DIRS = [BASE_DIR / "static"]
# WHITENOISE STORAGE ENGINE
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# Uploaded task attachments (local dev). In prod they go to Azure Blob instead.
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "/.auth/login/aad"  # App Service Easy Auth login endpoint (prod only, see accounts/middleware.py)

AZURE_STORAGE_ACCOUNT_URL = os.environ.get("AZURE_STORAGE_ACCOUNT_URL", "")
AZURE_STORAGE_CONTAINER = os.environ.get("AZURE_STORAGE_CONTAINER", "task-attachments")

# --- Notifications (email + Microsoft Teams) ---------------------------------
# Email: configure SMTP via env (e.g. Office 365: smtp.office365.com:587, TLS).
# When EMAIL_HOST is unset, emails are printed to the console (dev-friendly).
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "true").lower() == "true"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "pmonexus@localhost")
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend" if EMAIL_HOST
    else "django.core.mail.backends.console.EmailBackend"
)

# Teams: an Incoming Webhook URL for the channel that should receive updates.
TEAMS_WEBHOOK_URL = os.environ.get("TEAMS_WEBHOOK_URL", "")

# Base URL used to build links inside notifications.
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:8000")
