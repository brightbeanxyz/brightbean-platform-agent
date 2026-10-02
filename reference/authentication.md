# Authentication

There are two kinds of credential. Both end up as the same thing on the server: a
credential with one workspace, a list of channels and a set of permissions.

| | API key | OAuth connection |
|---|---|---|
| Works on | REST **and** MCP | MCP only |
| Who makes it | A workspace owner or admin, in Settings | Any member, by approving a connect screen |
| Best for | Scripts, Zapier/n8n, CI, your own agent, Claude Code with a header | claude.ai, Claude Desktop, Claude Code `/mcp`, MCP Inspector |
| Lifetime | Never, 30, 90 or 365 days, or a date | Access token 1 hour, refresh token 30 days (rotating) |

## API keys

### Getting one

The user does this in the web app. An agent cannot create keys.

1. Open [platform.brightbean.xyz/settings/workspace/api](https://platform.brightbean.xyz/settings/workspace/api).
   In the app: workspace switcher → **Workspace settings** → **API & MCP**.
2. Click **Create API key**. Only workspace **owners and admins** see this button; everyone
   else sees "Ask a workspace admin for an API key."
3. Fill in the dialog:
   - **Name**: e.g. "Zapier" (up to 80 characters).
   - **Channels**: the channels the key may use (at least one; up to 200).
   - **Permissions**: see the table below.
   - **Expires**: Never, In 30 days, In 90 days (the default), In 1 year, or On a date.
4. Click **Create key**. The key is shown **once** ("You won't see this key again").
   Copy it then. If it is lost, create a new one.

The reveal screen also shows two ready-made commands: a `curl` to `/api/v1/me/` and a
`claude mcp add` line for Claude Code.

### Permissions

| Permission | Label in the app | What it allows | Default |
|---|---|---|---|
| `read` | Read channels and posts | Every read except analytics: `me`, accounts, boards, TikTok creator info, YouTube categories, posts | Always on |
| `create_posts` | Create drafts and send for approval | Create, edit, duplicate and delete drafts; submit; withdraw | On |
| `upload_media` | Upload media | All media upload calls | On |
| `view_analytics` | Read analytics | Account and post analytics | On |
| `publish_directly` | Publish and schedule without approval | `schedule`, `publish`, `cancel`; deleting a scheduled or queued post; deliveries skip Review (unless the workspace requires approval for everyone) | **Off** |

A key's effective permissions are the ones ticked on it **and** held by the person who made
it, checked on every request. `GET /api/v1/me/` returns the effective set.

Without `publish_directly`, a key can still ask for a post to be scheduled or published
(through `create` with a `delivery`, or `submit`). The request goes to Review and
`routed` comes back `pending_approval`.

### Format

```
bb_live_<43 characters>_<8 characters>
└──┬──┘ └──────┬──────┘ └─────┬─────┘
   │           │              └─ keyed checksum (bad checksums are refused before any lookup)
   │           └─ 32 random bytes, base64url
   └─ environment: bb_live_ (production), bb_staging_ (staging), bb_local_ (a local dev server)
```

Regex: `^bb_(live|staging|local)_[A-Za-z0-9_-]{43}_[A-Za-z0-9_-]{8}$`

- A key only works on its own environment. A `bb_staging_` key on production is a 401.
- The server stores only a hash. In the app the key shows as a preview such as `bb_live_…9f3a`.
- The `bb_` prefix lets secret scanners spot a leaked key. Keep keys in environment
  variables or a secret store, never in source code.

### Sending it

```
Authorization: Bearer bb_live_...
User-Agent: my-agent/1.0
```

- The scheme is `Bearer`, matched without regard to case.
- **Send your own `User-Agent`.** Cloudflare sits in front of the API and blocks Python's
  built-in default (`Python-urllib/3.x`) with a plain-text `403` whose body is
  `error code: 1010`. That reply never reaches BrightBean. `requests`, `httpx`, curl, Node,
  Go and Java defaults all pass, and so does any value of your own.
- No cookies, no CSRF token, no session id. The key is the whole session.

Check a key with:

```bash
curl https://api-platform.brightbean.xyz/api/v1/me/ \
  -H "Authorization: Bearer $BRIGHTBEAN_API_KEY" \
  -H "User-Agent: my-agent/1.0"
```

### When a key is refused

Every refusal is `401` with `{"error": "unauthorized", "detail": "..."}`. Over REST there
is no `WWW-Authenticate` header.

| `detail` | Meaning | What to do |
|---|---|---|
| ``Send your API key as `Authorization: Bearer <key>`.`` | No usable `Authorization` header | Add the header |
| `That isn't a valid API key.` | Malformed, wrong environment, unknown, or too many bad tries from this IP | Check the key and the host. Don't retry in a loop. |
| `This API key has been revoked.` | Revoked in Settings | Ask the user for a new key |
| `This API key has expired.` | Past its expiry date | Ask the user for a new key |
| `The person who created this API key is no longer in the workspace.` | Its creator left | Ask a current admin for a new key |

Details:
- Revoking or editing a key takes effect **within about 60 seconds**.
- After about 10 failed lookups a minute from one IP, further attempts get the same
  `That isn't a valid API key.` (not a 429).

### Managing keys

In **API & MCP → API keys**, each key has **Activity** (its last 100 calls, which can take up
to 20 minutes to appear), **Edit** (name, channels, permissions, expiry; never the token
itself) and **Revoke**.

## OAuth (MCP clients)

MCP clients that support OAuth need no key. The user adds the MCP address and signs in.

```
https://api-platform.brightbean.xyz/api/v1/mcp
```

Enter it exactly: no trailing slash. The OAuth `resource` is this exact URL, and some
clients (claude.ai among them) require the two to match. Client-by-client setup is in
[`../mcp/`](../mcp/README.md).

What the client does by itself:

1. It calls the MCP address with no token and gets `401` with:
   ```
   WWW-Authenticate: Bearer resource_metadata="https://api-platform.brightbean.xyz/.well-known/oauth-protected-resource/api/v1/mcp"
   ```
2. It reads the protected-resource document, then
   `https://api-platform.brightbean.xyz/.well-known/oauth-authorization-server`.
3. It registers itself at `/oauth/register` (dynamic client registration, RFC 7591).
   - Redirect URIs must be `https`, or loopback (`localhost` / `127.0.0.1`).
   - Registration is limited to 10 a minute per IP.
4. It opens `/oauth/authorize/` in the browser with PKCE (`S256` only; `plain` is refused).
   - The user signs in to BrightBean if needed.
   - On the **connect screen**, the user picks the **workspace**, the **channels** (all
     ticked to start) and the **permissions**. `publish_directly` starts off.
   - **Allow** finishes the connection; **Cancel** returns `access_denied`.
5. It exchanges the code at `/oauth/token/` and calls MCP with `Authorization: Bearer <access token>`.
   - Access tokens last 1 hour.
   - Refresh tokens last 30 days and rotate on use.

Discovery document (production):

```json
{
  "issuer": "https://api-platform.brightbean.xyz",
  "authorization_endpoint": "https://api-platform.brightbean.xyz/oauth/authorize/",
  "token_endpoint": "https://api-platform.brightbean.xyz/oauth/token/",
  "registration_endpoint": "https://api-platform.brightbean.xyz/oauth/register",
  "revocation_endpoint": "https://api-platform.brightbean.xyz/oauth/token/",
  "scopes_supported": ["read", "create_posts", "upload_media", "view_analytics", "publish_directly"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
  "code_challenge_methods_supported": ["S256"]
}
```

Notes:
- **Scopes are advertised but not used to decide anything.** What a connection can do is
  what the user picked on the connect screen, intersected with their own role. A viewer can
  connect, and gets read-only tools.
- **Revoking a token:** POST `token=<token>` to `/oauth/revoke_token/` (or to the advertised
  `/oauth/token/` revocation endpoint).
  - Revoking an access token ends that token only.
  - Revoking a refresh token ends the whole connection.
- **Connecting again:** the same app connecting again to the same workspace replaces its
  earlier connection.
- **Seeing and ending connections:** the user sees them under **Settings → API & MCP →
  Connected apps**, with Activity and **Disconnect**. Disconnect stops the connection within
  a minute.
- **When the connection has ended:** MCP answers `401` with
  `WWW-Authenticate: Bearer resource_metadata="…", error="invalid_token"` and the detail
  `This connection has ended. Connect BrightBean again.` The client should start the OAuth
  flow again.
- **OAuth tokens don't work on REST.** REST takes API keys only.
