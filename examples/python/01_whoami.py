"""Who is this key? Workspace, effective permissions and channels.

    python 01_whoami.py
"""

from client import BrightBean, show

bb = BrightBean()
me = bb.get("/me/")
show(me)

if "publish_directly" not in me["permissions"]:
    print("\nNote: no publish_directly. Scheduling or publishing goes to Review (routed: pending_approval).")
