"""List the channels this key may use, with what each one can take.

    python 02_list_accounts.py
"""

from client import BrightBean

bb = BrightBean()
accounts = bb.get("/accounts/")["data"]

if not accounts:
    print("No channels on this key. Add channels to the key in Settings → API & MCP.")

for a in accounts:
    caps = a["capabilities"]
    flags = []
    if a["needsReconnect"]:
        flags.append("NEEDS RECONNECT in the app")
    if caps["mediaRequired"]:
        flags.append(f"needs {caps['mediaRequired']}")
    if caps["boardRequired"]:
        flags.append("needs boardId")
    if caps["title"]["required"]:
        flags.append("needs title")
    if caps["firstComment"]:
        flags.append("first comment ok")
    if caps["optionsKey"]:
        flags.append(f"options.{caps['optionsKey']}")
    print(f"{a['id']}  {a['platform']:<16} @{a['handle']:<24} max {caps['charLimit']} chars  {', '.join(flags)}")
    for q in a["queues"]:
        print(f"    queue {q['id']}  {q['name']}")
