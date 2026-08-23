import json
import logging
import os
import time

# from dotenv import load_dotenv  # Need "pip install python-dotenv"
import msal
import requests
from urllib import parse
import json
from pprint import pprint

# client_id = '' # postman
# secret = '' # postman
client_id = '' # CI
secret = '' # CI
tenant_id = ''
authority = f'https://login.microsoftonline.com/{tenant_id}'


global_token_cache = msal.TokenCache()
global_app = msal.ConfidentialClientApplication(
    client_id=client_id,
    authority=authority,  # For Entra ID or External ID
    client_credential=secret,
    token_cache=global_token_cache,
    )
scope = ['https://associatedservices-bxgha5fabuaefwhf.southeastasia-01.azurewebsites.net/ciAssociatedServices/TMAEmployee.Read']
# scope = ['https://associatedservices-bxgha5fabuaefwhf.southeastasia-01.azurewebsites.net/.default']
# scope = [f'{client_id}/.default']
# scope = [f'{client_id}/.default']
# redirect_uri = 'https://localhost:8080'
# print(help(msal.ConfidentialClientApplication.initiate_auth_code_flow))
# print(help(msal.ConfidentialClientApplication.acquire_token_by_auth_code_flow))
response = global_app.initiate_auth_code_flow(scopes=scope, response_mode='query')
# auth_response = dict(parse.parse_qsl(parse.urlsplit(response['auth_uri']).query))

print(response)
# print(auth_response)
# # print(result)

# print(result)
auth_response = {}

result = global_app.acquire_token_by_auth_code_flow(auth_code_flow=response, auth_response=auth_response)
# result = global_app.acquire_token_by_authorization_code(code='', scopes=scope)
print(result)

# response = requests.get(response['auth_uri'])
# print(type(response.headers))