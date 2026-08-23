from pathlib import Path
from django.shortcuts import render
import pandas as pd
import numpy as np
import base64
import json
from django.conf import settings
# from django.core.files.storage import FileSystemStorage
import os
import datetime
import pytz
from azure.identity import ManagedIdentityCredential, DefaultAzureCredential
from azure.storage.blob import BlobServiceClient
# Create your views here.

# def home(request):
#     return render(request, 'home.html')


# def gcdetail(request):
#     return render(request, 'gcdetail.html')

# kudu_ssh_user@4de853e9ad38:/$ ls /home/site/repository/
# README.md  ciassociatedservice  coreproject  manage.py  requirements.txt  staticfiles

APPFILE_DIR = Path(__file__).resolve().parent.parent.parent/'appfiles'
xls_filename = './ciassociatedservice/static/appfiles/TM_CIs_Associated_Service.xlsx'
xls_filename = APPFILE_DIR / 'TM_CIs_Associated_Service.xlsx'

def create_credential():
    if 'WEBSITE_HOSTNAME' in os.environ:
        credential = ManagedIdentityCredential()
    else:
        credential = DefaultAzureCredential()
    return credential

def upload_blob_file(filename: str, blob_service_client: BlobServiceClient, container_name: str, blob_name: str):
    container_client = blob_service_client.get_container_client(container=container_name)
    # with open(file=blob_name, mode="rb") as data:
    blob_client = container_client.upload_blob(name=filename, data=blob_name, overwrite=True)

def list_blobs_flat(blob_service_client: BlobServiceClient, container_name):
    container_client = blob_service_client.get_container_client(container=container_name)
    blob_list = container_client.list_blobs()
    count = 1
    blobinfo_list = []
    for blob in blob_list:
        # print(blob)
        blobname = blob.name
        blobsize = blob.size
        blobmtime = blob.last_modified
        print(f"{count}: {blobname} {blobsize}")
        blobinfo = {
            'blobname' : blobname,
            'blobsize' : int(blobsize),
            'blobmtime' : blobmtime 
            }
        filemtime = blobinfo['blobmtime']
        SGT = 'Asia/Singapore'
        localfilemtime = filemtime.astimezone(pytz.timezone(SGT))
        blobmtime_SGT = localfilemtime.strftime("%d/%m/%Y-%H:%M:%S")
        blobinfo['blobmtime'] = blobmtime_SGT
        blobinfo_list.append(blobinfo)
        count = count + 1
        print(10 * '-')
    print(f'printing blobinfo_dict here......{blobinfo_list}')
    return blobinfo_list


def upload_blob(filename, file_to_upload):
    try:
        credential = create_credential()
    except Exception as ex:
        print('Exception:')
        print(ex)
    try:
        print("Azure Blob Storage File Upload")
        SA = 'tmivplaybookssa'
        container_name = 'tmassetsandnttservices'
        account_url = f"https://{SA}.blob.core.windows.net"
        # Create the BlobServiceClient object
        blob_service_client = BlobServiceClient(account_url, credential=credential)
        # containers = blob_service_client.list_containers(include_metadata=True)
        # file_to_upload = 'TM_CIs_Associated_Service.xlsx'
        upload_blob_file(filename=filename, blob_service_client=blob_service_client, container_name=container_name, blob_name=file_to_upload)
        print(10 * "--------")
        print('The following is the current list of files after you have uploaded')
        new_blob_list = list_blobs_flat(blob_service_client=blob_service_client, container_name=container_name)
        print(10 * "--------")
        return new_blob_list
    except Exception as ex:
        print('Exception:')
        print(ex)

def list_blob():
    credential = create_credential()
    SA = 'tmivplaybookssa'
    container_name = 'tmassetsandnttservices'
    account_url = f"https://{SA}.blob.core.windows.net"
    blob_service_client = BlobServiceClient(account_url, credential=credential)
    blob_list = list_blobs_flat(blob_service_client=blob_service_client, container_name=container_name)
    return blob_list


def generate_html(dataframe: pd.DataFrame):
    '''get the table HTML from the dataframe'''
    tableid = 'table'
    table_html = dataframe.to_html(justify="center", table_id=tableid, header=True, render_links=True, classes=['text-end'], index=False)
    # construct the complete HTML with jQuery Data tables
    # You can disable paging or enable y scrolling on lines 20 and 21 respectively
    html = f"""
    {table_html}
    """
    # return the html
    return html


def get_data(xlsfile: str, xlssheet: str, filtercolumnname: str, filterstring: str):
    '''
    This function reads an excel sheet and filter the contents from a filtercolumnname with filterstring.
    Once we have the dataframe with filtered table, we insert the output with HTML elements that can show this dataframe as table on web page.
    '''
    df = pd.read_excel(xlsfile ,sheet_name=xlssheet)
    df.replace(np.nan, 'NA', inplace=True)
    if filterstring == 'ALL':
        df_filtered = df
    else:
        df_filtered = df[df[filtercolumnname].isin([filterstring.upper()])]
    generated_filtered_df_as_html = generate_html(df_filtered)
    return generated_filtered_df_as_html


def gethtmltemplate(cli_xlsfile, cli_xlssheet, cli_columnToFilter, cli_gcname):
    '''
    This is a wrapper function to get_data so that we can dynamically pass information when calling this.
    '''
    filtered_html = get_data(xlsfile=cli_xlsfile, xlssheet=cli_xlssheet, filtercolumnname=cli_columnToFilter, filterstring=cli_gcname)
    return filtered_html


def parse_header(request):
    headers = request.headers
    client_principal = headers['X-Ms-Client-Principal']
    principal_name = headers['X-Ms-Client-Principal-Name']
    # access_token = headers['X-Ms-Token-Aad-Access-Token']
    # print(client_principal)
    # Payload is base64 encoded, let's decode it to plain string
    # To make sure decoding will always work - we're adding max padding ("==")
    # to payload - it will be ignored if not needed.
    client_principal_decoded = str(base64.b64decode(client_principal + "=="), "utf-8")
    # Payload is JSON - we can load it to dict for easy access
    client_principal = json.loads(client_principal_decoded)
    # print(client_principal)
    roles_from_claim = filter(lambda claim: claim['typ'] == 'roles', client_principal['claims']) # e.g. TM.TMLS.Read
    name_from_claim  = filter(lambda claim: claim['typ'] == 'name', client_principal['claims'])
    name = next(name_from_claim)['val']
    roles = []
    for role_dict in roles_from_claim:
        roles.append(role_dict['val'])
    print(name)     # printed on console for debug
    print(roles)    # printed on coonsole for debug
    gclist = []
    if roles:
        for role in roles:
            if role.split(".")[0] == 'TM':
                gc = role.split(".")[1]
                gclist.append(gc)
    # else:
    #     gclist.append('No_Access')
    if 'Admin' in gclist:
        rolepermission = 'Admin'
    else:
        rolepermission = 'Read'
    print(f'{name} has permission: {rolepermission}')
    # Since I have a very simple role arrangement like TM.<gcname>.Read. The permission is always Read. 
    # We have a role defined like: TM.Admin. Admin is not a gc. But I have it there in gclist.
    # so, if gc is Admin, I treat it as the user has Admin rights and will be able to uplaod file to storage account.
    # Other example of roles are: TM.TMLS.Read, TM.TMLTH.Read
    # Since, Admin is NOT a GC, remove it from gclist
    gclist.remove('Admin')
    return (name, gclist, rolepermission)

def parse_header_test(request):
    gclist = ['TMA', 'TMLI', 'TMIS', 'TMLS', 'TMLTH', 'TMSTH', 'TMIM', 'TMLM', 'TMIV', 'TMI']
    name = 'Manish Jain'
    rolepermission = 'Admin'
    return (name, gclist, rolepermission)

# Create your views here.
def home(request):
    '''
    This is the home page. Navigate ahead from the main link below on this page.
    '''
    # (name, gclist, rolepermission) = parse_header_test(request)
    (name, gclist, rolepermission) = parse_header(request)
    context = {
        'name'  : name,
        'title' : 'TM-ASSETS-Home',
    }
    return render(request, 'home.html', context)

def gclist(request):
    '''
    This function gets executed upon calling main link from home page.
    '''
    # (name, gclist, rolepermission) = parse_header_test(request)
    (name, gclist, rolepermission) = parse_header(request)
    context = {
        'name': name,
        'assigned_gc': gclist,
        'title' : 'TM-GCs',
    }
    if rolepermission == 'Read':
        return render(request, 'gclist.html', context)
    if rolepermission == 'Admin':
        if request.method == 'POST':
            existing_blob_list = list_blob()
            context.update({'blobinfoexisting': existing_blob_list})
            uploaded_file = request.FILES['Document']
            uploaded_file_name = uploaded_file.name
            if uploaded_file_name != 'TM_CIs_Associated_Service.xlsx':
                context['filename_error'] = 'File name must be TM_CIs_Associated_Service.xlsx'
                return render(request, 'upload.html', context)
            uploaded_file_size = uploaded_file.size
            print(f"uploading file: {uploaded_file_name}")
            print(f"file size is: {uploaded_file_size}")
            # if you want to save the file to storage account
            blobs = upload_blob(filename=uploaded_file_name, file_to_upload=uploaded_file)
            context.update({'blobinfonew': blobs})
            # if you want to save the file to django /media filesystem storage
            # fs = FileSystemStorage()
            # fs.save(uploaded_file.name, uploaded_file)
            # if fs.exists(uploaded_file):
                # print('file was uploaded')
            # print(context)
            return render(request, 'upload.html', context)
        if request.method == 'GET':
            existing_blob_list = list_blob()
            context.update({'blobinfoexisting': existing_blob_list})
            return render(request, 'upload.html', context)
    
# Create your views here.
def assetlist(request, gcname):
    '''
    This function gets executed upon calling for any gcname.
    ''' 
    # (name, gclist, rolepermission) = parse_header_test(request)
    (name, gclist, rolepermission) = parse_header(request)
    if gcname in gclist:
        xls_sheetname = f'{gcname}_Asset_List'
        context = {
            # 'data_table': gethtmltemplate(xls_filename,'CIs_Asscoiated Service Offering','GC', gcname),
            'data_table': gethtmltemplate(xls_filename,xls_sheetname,'GC', gcname),
            'title': f'TM-ASSETS-{gcname}',
            'name': name,
            'assigned_gc': gclist
            }
        return render(request, 'assetlist.html', context)
