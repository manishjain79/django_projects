import requests
storage_account_name = 'tmivplaybookssa'
container_name = 'tmassetsandnttservices'
api_version = '2020-04-08'
token = ''''''
bloburl = (f'https://{storage_account_name}.blob.core.windows.net/?comp=list')
scope = f'https://{storage_account_name}.blob.core.windows.net/user_impersonation'
try:
    response = requests.get(bloburl, headers={'Authorization': f'Bearer {token}'})
    print(response.content)
except Exception as ex:
        print('Exception:')
        print(ex)