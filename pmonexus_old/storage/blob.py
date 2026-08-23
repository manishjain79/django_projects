"""
Azure Blob access using the exact credential pattern from the Excel app:
ManagedIdentityCredential when running on App Service, DefaultAzureCredential
locally (which falls back to your `az login` session). No connection strings
or account keys stored anywhere.

Setup this requires:
  - Prod: the App Service's system-assigned managed identity needs "Storage
    Blob Data Contributor" on the storage account.
  - Local: run `az login` once; DefaultAzureCredential picks that up.
"""
import os

from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
from azure.storage.blob import BlobServiceClient, ContentSettings

from config.environment import is_running_on_azure


def create_credential():
    if is_running_on_azure():
        credential = ManagedIdentityCredential()
    else:
        credential = DefaultAzureCredential()
    return credential


def get_blob_service_client() -> BlobServiceClient:
    account_url = os.environ["AZURE_STORAGE_ACCOUNT_URL"]
    return BlobServiceClient(account_url=account_url, credential=create_credential())


def upload_attachment(blob_name: str, file_obj, content_type: str | None = None) -> str:
    container = os.environ.get("AZURE_STORAGE_CONTAINER", "task-attachments")
    client = get_blob_service_client()
    container_client = client.get_container_client(container)
    settings = ContentSettings(content_type=content_type) if content_type else None
    container_client.upload_blob(name=blob_name, data=file_obj, overwrite=True, content_settings=settings)
    return container_client.get_blob_client(blob_name).url
