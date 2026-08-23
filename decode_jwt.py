import base64
import json
import requests

# Get the token in the token variable 
######uncomment and put token here --> token = ""
# Split by dot and get middle, payload, part;
token_payload = token.split(".")[1]
# Payload is base64 encoded, let's decode it to plain string
# To make sure decoding will always work - we're adding max padding ("==")
# to payload - it will be ignored if not needed.
token_payload_decoded = str(base64.b64decode(token_payload + "=="), "utf-8")
# Payload is JSON - we can load it to dict for easy access
payload = json.loads(token_payload_decoded)

print(payload)
print(payload['scp'])
print(payload['roles'][0])

myurl = 'https://associatedservices-bxgha5fabuaefwhf.southeastasia-01.azurewebsites.net/ciAssociatedServices/TMI'
myurl = 'https://associatedservices-bxgha5fabuaefwhf.southeastasia-01.azurewebsites.net/'

# response = requests.get(myurl, headers={'Authorization': f'token {token}'})
response = requests.get(myurl, headers={'Authorization': f'Bearer {token}'})
# response = requests.get(myurl, headers={ 'Authorization': token })


print(response.content)