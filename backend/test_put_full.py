import urllib.request, json
import sys

def main():
    try:
        # Get the PO first
        req = urllib.request.Request('http://localhost:8000/api/v1/procurement/purchase-orders/10', headers={'X-Tenant-ID': 'ssb01', 'X-User-Roles': 'PROCUREMENT.PO.EDIT'})
        with urllib.request.urlopen(req) as resp:
            po = json.loads(resp.read().decode('utf-8'))
        
        # Modify status
        po['status'] = 'PENDING_APPROVAL'
        po['docDate'] = '2026-08-28'
        po['promisedDate'] = '2026-09-05'
        
        put_req = urllib.request.Request(
            'http://localhost:8000/api/v1/procurement/purchase-orders/10',
            data=json.dumps(po).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'X-Tenant-ID': 'ssb01', 'X-User-Roles': 'PROCUREMENT.PO.EDIT', 'X-User-ID': '1'},
            method='PUT'
        )
        
        with urllib.request.urlopen(put_req) as resp:
            print("Status:", resp.status)
            print("Body:", resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)
        print("Body:", e.read().decode('utf-8'))
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
