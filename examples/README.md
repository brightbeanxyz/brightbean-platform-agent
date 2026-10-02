# Examples

The same steps in three languages. Each script is short and standalone; read it before you
run it.

```bash
export BRIGHTBEAN_API_KEY=bb_live_...          # Settings → Workspace → API & MCP → Create API key
# export BRIGHTBEAN_API_URL=https://api-platform-staging.brightbean.xyz   # optional; production by default
```

| # | What | Python 3.9+ (`requests`) | Node 18+ (no deps) | Shell (`curl` + `jq` 1.6+) |
|---|---|---|---|---|
| 01 | Who is this key | `01_whoami.py` | `01_whoami.mjs` | `01_whoami.sh` |
| 02 | List channels + capabilities | `02_list_accounts.py` | `02_list_accounts.mjs` | `02_list_accounts.sh` |
| 03 | Create a draft | `03_create_draft.py` | `03_create_draft.mjs` | `03_create_draft.sh` |
| 04 | Schedule / queue a draft (or submit to Review) | `04_schedule.py` | `04_schedule.mjs` | `04_schedule.sh` |
| 05 | Create and deliver in one call | `05_create_and_deliver.py` | `05_create_and_deliver.mjs` | `05_create_and_deliver.sh` |
| 06 | Unschedule, then delete | `06_cancel_and_delete.py` | `06_cancel_and_delete.mjs` | `06_cancel_and_delete.sh` |
| 07 | Idempotent retries | `07_idempotent_retry.py` | `07_idempotent_retry.mjs` | `07_idempotent_retry.sh` |
| 08 | Upload a file (multipart, presigned) | `08_upload_media.py` | `08_upload_media.mjs` | `08_upload_media.sh` |
| 09 | Wait until a post has gone out (incl. through Review) / follow changes | `09_poll_changes.py` | `09_poll_changes.mjs` | `09_poll_post.sh` |
| 10 | Analytics | `10_analytics.py` | `10_analytics.mjs` | `10_analytics.sh` |
| 11 | MCP over plain HTTP | `11_mcp_client.py` | `11_mcp_client.mjs` | `11_mcp_call.sh` |

A first run that changes nothing outside a draft:

```bash
cd examples/python && pip install -r requirements.txt
python 01_whoami.py
python 02_list_accounts.py                       # copy a channel id
python 03_create_draft.py <channel_id> --caption "Hello from the API"
python 06_cancel_and_delete.py <post_id> --delete
```

⚠️ `04`, `05` and `09` schedule or watch real posts. A scheduled post **will go out** at its
time unless you cancel it (`06`). Nothing here publishes immediately.

All clients send their own `User-Agent`, because Cloudflare blocks Python's
`Python-urllib` default. They raise the API's `error` and `detail` on failure.

The upload scripts accept `.png .jpg .jpeg .webp .gif .mp4 .mov .webm`, the types BrightBean
takes. They refuse anything else before sending a byte.
