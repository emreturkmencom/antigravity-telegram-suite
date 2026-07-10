#!/usr/bin/env python3
import sys
import argparse
import dbus

def main():
    parser = argparse.ArgumentParser(description="GNOME Keyring DBus Helper")
    parser.add_argument("--action", choices=["store", "lookup", "clear"], required=True)
    parser.add_argument("--label", default="gemini")
    parser.add_argument("--service", default="gemini")
    parser.add_argument("--username", default="antigravity")
    args = parser.parse_args()

    try:
        bus = dbus.SessionBus()
        service_obj = bus.get_object('org.freedesktop.secrets', '/org/freedesktop/secrets')
        service = dbus.Interface(service_obj, 'org.freedesktop.Secret.Service')

        if args.action == "store":
            # 1. Open Session
            session_output, session_path = service.OpenSession('plain', dbus.String('', variant_level=1))
            
            # 2. Get default collection
            collection_path = service.ReadAlias('default')
            if not collection_path or collection_path == '/':
                collections = service_obj.Get('org.freedesktop.Secret.Service', 'Collections', dbus_interface='org.freedesktop.DBus.Properties')
                if collections:
                    collection_path = collections[0]
                else:
                    raise Exception("No keyring collections found")

            collection_obj = bus.get_object('org.freedesktop.secrets', collection_path)
            collection = dbus.Interface(collection_obj, 'org.freedesktop.Secret.Collection')

            # Read secret from stdin
            secret_value = sys.stdin.read().strip()
            if not secret_value:
                raise Exception("No secret provided on stdin")

            # 3. Create properties & attributes
            attributes = dbus.Dictionary({
                'service': dbus.String(args.service),
                'username': dbus.String(args.username)
            }, signature='ss')

            properties = dbus.Dictionary({
                'org.freedesktop.Secret.Item.Label': dbus.String(args.label, variant_level=1),
                'org.freedesktop.Secret.Item.Attributes': dbus.Dictionary(attributes, signature='ss', variant_level=1)
            }, signature='sv')

            secret = dbus.Struct(
                (session_path, dbus.ByteArray(b''), dbus.ByteArray(secret_value.encode('utf-8')), 'application/json'),
                signature='oayays'
            )

            # Write/Replace Item
            item_path, prompt_path = collection.CreateItem(properties, secret, True)
            print(f"STORED:{item_path}")
            sys.exit(0)

        elif args.action == "lookup":
            # Search items matching service and username
            # SearchItems(Dict{String, String} attributes) -> (Array[ObjectPath] unlocked, Array[ObjectPath] locked)
            attributes = dbus.Dictionary({
                'service': dbus.String(args.service),
                'username': dbus.String(args.username)
            }, signature='ss')

            unlocked, locked = service.SearchItems(attributes)
            items = unlocked + locked
            if not items:
                print("NOT_FOUND")
                sys.exit(0)

            # Open session
            session_output, session_path = service.OpenSession('plain', dbus.String('', variant_level=1))

            # Retrieve secret from first match
            item_path = items[0]
            item_obj = bus.get_object('org.freedesktop.secrets', item_path)
            item = dbus.Interface(item_obj, 'org.freedesktop.Secret.Item')
            
            retrieved_secret_struct = item.GetSecret(session_path)
            retrieved_val = bytes(retrieved_secret_struct[2])
            print(retrieved_val.decode('utf-8'))
            sys.exit(0)

        elif args.action == "clear":
            attributes = dbus.Dictionary({
                'service': dbus.String(args.service),
                'username': dbus.String(args.username)
            }, signature='ss')

            unlocked, locked = service.SearchItems(attributes)
            items = unlocked + locked
            if not items:
                print("NOT_FOUND")
                sys.exit(0)

            for item_path in items:
                item_obj = bus.get_object('org.freedesktop.secrets', item_path)
                item = dbus.Interface(item_obj, 'org.freedesktop.Secret.Item')
                item.Delete()
            print("CLEARED")
            sys.exit(0)

    except Exception as e:
        print(f"ERROR:{e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
