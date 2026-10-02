"""Schedule a draft for a time, or put it in its channels' queue.

Needs publish_directly. Without it, use --submit: the request goes to Review instead.

    python 04_schedule.py <post_id> --at 2026-10-06T09:00:00+02:00
    python 04_schedule.py <post_id> --at "tomorrow 09:00" --tz Europe/Berlin
    python 04_schedule.py <post_id> --queue
    python 04_schedule.py <post_id> --at 2026-10-06T09:00:00+02:00 --submit
"""

from __future__ import annotations

import argparse
import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from client import BrightBean, new_idempotency_key, show


def parse_at(value: str, tz: str | None) -> str:
    """Return an ISO time WITH an offset: the API refuses times without one."""
    zone = ZoneInfo(tz) if tz else None
    match = re.fullmatch(r"tomorrow (\d{1,2}):(\d{2})", value.strip())
    if match:
        wall = time(int(match.group(1)), int(match.group(2)))
        if zone:
            day = datetime.now(zone).date() + timedelta(days=1)
            return datetime.combine(day, wall, tzinfo=zone).isoformat()
        # A naive local time's .astimezone() takes the offset in force on THAT day, so a
        # daylight-saving change overnight still lands on the right wall-clock time.
        day = date.today() + timedelta(days=1)
        return datetime.combine(day, wall).astimezone().isoformat()
    # fromisoformat() only accepts a trailing "Z" from Python 3.11 on.
    parsed = datetime.fromisoformat(re.sub(r"[zZ]$", "+00:00", value.strip()))
    if parsed.tzinfo is None:
        if not zone:
            raise SystemExit("Give the time an offset (+02:00 / Z) or pass --tz.")
        parsed = parsed.replace(tzinfo=zone)
    return parsed.isoformat()


parser = argparse.ArgumentParser()
parser.add_argument("post_id")
when = parser.add_mutually_exclusive_group(required=True)
when.add_argument("--at")
when.add_argument("--queue", action="store_true")
when.add_argument("--prioritise", action="store_true")
parser.add_argument("--tz", help="IANA zone for --at without an offset, e.g. Europe/Berlin")
parser.add_argument("--submit", action="store_true", help="send through submit (works without publish_directly)")
args = parser.parse_args()

if args.at:
    delivery = {"mode": "at", "at": parse_at(args.at, args.tz)}
else:
    delivery = {"mode": "queue" if args.queue else "prioritise"}

bb = BrightBean()
key = new_idempotency_key("schedule")
if args.submit:
    result = bb.post(f"/posts/{args.post_id}/submit", {"delivery": delivery}, idempotency_key=key)
else:
    result = bb.post(f"/posts/{args.post_id}/schedule", delivery, idempotency_key=key)
show(result)
print(f"\nrouted: {result['routed']}")
if result["routed"] == "pending_approval":
    print("Sent to Review: it goes out once someone approves it in BrightBean.")
