"""
Single source of truth for "am I running on Azure App Service, or locally".

Same trick as the Excel/DataTables app: App Service always sets WEBSITE_HOSTNAME
in the process environment. It is never set on a local machine, so its presence
is a reliable switch. Everything else (which auth headers to trust, which Azure
credential class to use) branches off this one function.
"""
import os


def is_running_on_azure() -> bool:
    return "WEBSITE_HOSTNAME" in os.environ


def environment_name() -> str:
    return "prod" if is_running_on_azure() else "local"
