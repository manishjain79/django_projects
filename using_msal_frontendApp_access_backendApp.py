import json
import logging
import os
import time

# from dotenv import load_dotenv  # Need "pip install python-dotenv"
import msal
import requests
from urllib import parse

client_id = '2d750f0c-3b1b-48fd-866c-1f8469b3a3c9' # postman
secret = '' # postman
CI_client_id = 'b2e4385f-e998-4dc6-8740-a2917a2ac581' # CI
# secret = '' # CI
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
# scope = [f'{CI_client_id}/.default']
# scope = [f'{client_id}/.default']
# redirect_uri = 'https://localhost:8080'
# print(help(msal.ConfidentialClientApplication.initiate_auth_code_flow))
# print(help(msal.ConfidentialClientApplication.acquire_token_by_auth_code_flow))
# response = global_app.initiate_auth_code_flow(scopes=scope, response_mode='query')
# auth_response = dict(parse.parse_qsl(parse.urlsplit(response['auth_uri']).query))
# result = global_app.acquire_token_by_auth_code_flow(auth_code_flow=response, auth_response=auth_response)
# print(response)
# print(auth_response)
# # print(result)

result = global_app.acquire_token_for_client(scopes=scope)

# Here we are requesting the token from client_id.
# Normally Client application in app registration has default scope permitted [user.read for Microsoft Graph API]
# But, in case you have an application where authentication is enabled. In this case above, result will be in error.
# the client application, 'ci_associated_services', has enabled authentication in app registration blade.
# As soon as you enable authentication, the enterprise application of same client, will enable 'Assignment Required' to Yes.
# This error is occuring because of this switch.
# With this switch is ON, whenever any user or end client app (python or postman) tries to access this app with client_id,
# enterprise application is the first one which is presented.
# the permissions are assigned when a user logs in. All good. 
# But, when any other front end client application, like postman e.g. if registered in app registration, tries to access this ci_associated_services app
# it cannot get token.
# To overcome this error, you will need to add permission in app registration page of ci_associated_services for enterprise application API for app roles
# that it is exposing with application grants since front end app like postman is accessing this app.

print(result)


# result = global_app.acquire_token_by_authorization_code(code='', scopes=scope)
# print(result)