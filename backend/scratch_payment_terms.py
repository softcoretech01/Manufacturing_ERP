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

    # Get payment-terms
    req = urllib.request.Request(
        'http://localhost:8000/api/v1/payment-terms',
        headers={'Authorization': 'Bearer ' + token}
    )
    try:
        with urllib.request.urlopen(req) as response:
            print(response.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)
        print(e.read().decode())

main()
