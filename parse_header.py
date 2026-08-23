import base64
import json
import requests

raw_log = '''
'''



headers_old = 



headers = 

def parse_header(headers):
    # headers = request.headers
    client_principal = headers['X-Ms-Client-Principal']
    principal_name = headers['X-Ms-Client-Principal-Name']
    # print(client_principal)
    # Payload is base64 encoded, let's decode it to plain string
    # To make sure decoding will always work - we're adding max padding ("==")
    # to payload - it will be ignored if not needed.
    client_principal_decoded = str(base64.b64decode(client_principal + "=="), "utf-8")
    # Payload is JSON - we can load it to dict for easy access
    client_principal = json.loads(client_principal_decoded)
    # print(client_principal)
    roles_from_claim = filter(lambda claim: claim['typ'] == 'roles', client_principal['claims'])
    name_from_claim = roles = filter(lambda claim: claim['typ'] == 'name', client_principal['claims'])
    name = next(name_from_claim)['val']
    roles = []
    for role_dict in roles_from_claim:
        roles.append(role_dict['val'])
    # print(roles)
    return (roles, name)

(roles, name) = parse_header(headers)

print(roles)


# client_principal = headers['X-Ms-Client-Principal']
# principal_name = headers['X-Ms-Client-Principal-Name']
# # print(client_principal)
# # Payload is base64 encoded, let's decode it to plain string
# # To make sure decoding will always work - we're adding max padding ("==")
# # to payload - it will be ignored if not needed.
# client_principal_decoded = str(base64.b64decode(client_principal + "=="), "utf-8")
# # Payload is JSON - we can load it to dict for easy access
# payload = json.loads(client_principal_decoded)

# print(payload)
# roles_from_claim = filter(lambda claim: claim['typ'] == 'roles', payload['claims'])
# name_from_claim = roles = filter(lambda claim: claim['typ'] == 'name', payload['claims'])



# # role = next(roles_from_claim)['val']
# myname = next(name_from_claim)['val']
# roles = []
# for role_dict in roles_from_claim:
#     roles.append(role_dict['val'])

# print(roles)



# def role_selection(roles: list):
#     for role in roles:
#         if role.split(".")[0] == 'TM':
#             myrole = role
#             gc = role.split(".")[1]
#             return (myrole, gc)

# # role, gc = role_selection()


# # print(role)
# # print(gc)
