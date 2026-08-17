import urllib.request
import urllib.parse
import json

def main():
    # Login
    req = urllib.request.Request(
        'http://localhost:8000/api/v1/auth/login',
        data=json.dumps({'login_id':'admin', 'password': 'password'}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as response:
        token = json.loads(response.read())['access_token']

    # Get branches
    req = urllib.request.Request(
        'http://localhost:8000/api/v1/branches',
        headers={'Authorization': 'Bearer ' + token}
    )
    with urllib.request.urlopen(req) as response:
        branches = json.loads(response.read())
        print(branches)
        
    if not branches.get('data'):
         print('No branches')
         return
         
    branch_uid = branches['data'][0]['uid']
    print('using branch', branch_uid)
    
    # Create plant
    req = urllib.request.Request(
        'http://localhost:8000/api/v1/plants',
        data=json.dumps({'name': 'test plant', 'branch_uid': branch_uid}).encode('utf-8'),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            print(response.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)
        print(e.read().decode())

main()
