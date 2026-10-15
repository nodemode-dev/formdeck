# FormDeck relay

A small server that lets people outside your network open FormDeck share links. FormDeck stays on your computer and connects out to the relay; the relay passes guests' requests through that connection and never stores a deck. Off by default: sharing on the local network does not need it.

## How it works

| Step | What happens |
| --- | --- |
| 1 | You run this relay somewhere reachable (a small VPS, a container platform, a machine at the office) behind HTTPS |
| 2 | In FormDeck, File > Share Deck: tick "Also share through a relay", enter the relay's address and one of its tokens, Connect |
| 3 | FormDeck opens one outgoing WebSocket to `/tunnel`; links in the dialog gain an "Anywhere" address, `https://relay/h/<host>/s/<token>` |
| 4 | A guest opens that link; the relay forwards each request to FormDeck, which checks the link's role (view, comment or edit) exactly as on the local network |

The relay only forwards. Every rule (which deck, which role, what a guest may call) is enforced by FormDeck itself; the relay cannot read or change decks on its own. Removing a link, turning the relay off in FormDeck, or closing FormDeck stops access at once.

## Run it

```
python3 -m venv venv && venv/bin/pip install -r requirements.txt
FORMDECK_RELAY_TOKENS=long-random-token-1,long-random-token-2 venv/bin/python formdeck_relay.py
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `FORMDECK_RELAY_TOKENS` | none (refuses to start) | Comma-separated tokens; each FormDeck connects with one |
| `PORT` | 8199 | Port to listen on |
| `FORMDECK_RELAY_HOST` | 0.0.0.0 | Address to listen on |
| `FORMDECK_RELAY_TIMEOUT` | 60 | Seconds to wait for FormDeck to answer a request |

Put it behind a TLS-terminating proxy (Caddy, nginx, a platform load balancer) so guests use `https://`; WebSockets must be passed through. Make tokens long and random (for example `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`). A token holder can attach a FormDeck to the relay, not read anyone's decks; give each person or computer its own token so one can be withdrawn by restarting without it.

`GET /healthz` reports `{"ok": true, "hosts": n}`.

## Limits

- One relay origin serves one FormDeck per browser at a time (the relay remembers which in a cookie set by the `/h/<host>/` link); opening a second person's link in the same browser switches to theirs.
- Responses are passed whole, up to 64 MB each; very large videos are better shared another way.
- Everything goes through your FormDeck's connection, so its upload speed limits how fast guests load pictures and media.
