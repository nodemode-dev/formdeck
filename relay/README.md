# formdeck relay

A small server that lets people outside your network open formdeck share links. formdeck stays on your computer and connects out to the relay; the relay passes guests' requests through that connection and never stores a deck. Off by default: sharing on the local network does not need it.

## How it works

| Step | What happens |
| --- | --- |
| 1 | You run this relay somewhere reachable (a small VPS, a container platform, a machine at the office) behind HTTPS |
| 2 | In formdeck, File > Share Deck: tick "Also share through a relay", enter the relay's address and one of its tokens, Connect |
| 3 | formdeck opens one outgoing WebSocket to `/tunnel`; links in the dialog gain an "Anywhere" address, `https://relay/h/<host>/s/<token>` |
| 4 | A guest opens that link; the relay forwards each request to formdeck, which checks the link's role (view, comment or edit) exactly as on the local network |

The relay only forwards. Every rule (which deck, which role, what a guest may call) is enforced by formdeck itself; the relay cannot read or change decks on its own. Removing a link, turning the relay off in formdeck, or closing formdeck stops access at once.

## Run it

```
python3 -m venv venv && venv/bin/pip install -r requirements.txt
FORMDECK_RELAY_TOKENS=long-random-token-1,long-random-token-2 venv/bin/python formdeck_relay.py
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `FORMDECK_RELAY_TOKENS` | none (refuses to start) | Comma-separated tokens; each formdeck connects with one |
| `PORT` | 8199 | Port to listen on |
| `FORMDECK_RELAY_HOST` | 0.0.0.0 | Address to listen on |
| `FORMDECK_RELAY_TIMEOUT` | 60 | Seconds to wait for formdeck to answer a request |
| `FORMDECK_RELAY_CERT`, `FORMDECK_RELAY_KEY` | none | Certificate and key files; set both to serve HTTPS directly (port then defaults to 8443) |
| `FORMDECK_RELAY_PROXIES` | 127.0.0.1 | Addresses whose `X-Forwarded-Proto` and `X-Forwarded-For` are believed; set it to your proxy's address (for Docker, the bridge gateway such as 172.17.0.1) |

Guests must reach the relay over `https://` so links, cookies and the live connection are encrypted. Either put it behind a TLS-terminating proxy, or give it a certificate directly:

| Setup | Files here | Notes |
| --- | --- | --- |
| Caddy in front (simplest) | `Caddyfile.example` | Caddy gets and renews the certificate and passes WebSockets through on its own |
| nginx in front | `nginx.conf.example` | Keeps `Host`, passes `Upgrade`, turns off buffering and allows long-lived connections |
| No proxy | none | `FORMDECK_RELAY_CERT=/path/fullchain.pem FORMDECK_RELAY_KEY=/path/privkey.pem` |
| As a service | `formdeck-relay.service` | systemd unit for `/opt/formdeck-relay` with tokens in `/etc/formdeck-relay.env` |
| In a container | `Dockerfile` | `docker build -t formdeck-relay . && docker run -p 127.0.0.1:8199:8199 -e FORMDECK_RELAY_TOKENS=... -e FORMDECK_RELAY_PROXIES=172.17.0.1 formdeck-relay` behind Caddy or nginx |

formdeck checks the relay's certificate like a browser does. A certificate from a public authority (Let's Encrypt through Caddy or certbot) works as is. A private or self-signed one works only if the computer running formdeck trusts its authority (start formdeck with `SSL_CERT_FILE` pointing at it), and the authority certificate must carry the CA key-usage extension, or Python 3.13 and later refuse it.

Make tokens long and random (for example `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`). A token holder can attach a formdeck to the relay, not read anyone's decks; give each person or computer its own token so one can be withdrawn by restarting without it.

`GET /healthz` reports `{"ok": true, "hosts": n}`.

## What has been tested

On one computer, with the relay serving HTTPS from a test certificate authority: formdeck connected over `wss://`; guests opened view and edit links over `https://`, followed a slide show, sent questions to Presenter View and co-edited; both cookies were `Secure` and `HttpOnly`; a 20 MB file arrived intact and Range requests answered 206; two formdecks with different tokens stayed separate and one could not take over the other's address; a guest could not reach settings, other decks or the deck list. Not yet tried: a public server with Caddy or nginx, guests on other networks, the Dockerfile and the systemd unit (written to the usual conventions but not run here).

## Limits

- One relay origin serves one formdeck per browser at a time (the relay remembers which in a cookie set by the `/h/<host>/` link); opening a second person's link in the same browser switches to theirs.
- Responses are streamed in 512 KB pieces, and Range requests work, so videos can seek. The relay holds the pieces in memory until the guest has read them, so a very slow guest on a large video uses relay memory for that file's size.
- Everything goes through your formdeck's connection, so its upload speed limits how fast guests load pictures and media.
