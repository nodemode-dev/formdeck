# Security policy

## Supported versions

Security fixes go into the newest release. Please update before reporting, and
check whether the problem is still there.

| Version | Supported |
| --- | --- |
| 0.30.x (latest release) | Yes |
| Anything older | No |

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use GitHub's private
reporting instead: on the repository's **Security** tab, choose **Report a
vulnerability**. Include what you found, the steps to reproduce it, the version and
platform, and what an attacker could do with it.

You can expect an acknowledgement within a week. We will keep you informed while it
is fixed and credit you in the release notes, unless you would rather not be named.

## What counts

FormDeck runs on your own machine, so the things that matter most are the ways
something outside it could get in:

- **The engine** binds to loopback (127.0.0.1). Anything that makes it reachable
  from another machine without the person turning that on.
- **Deck sharing** on the local network or through a relay (off by default): opening
  a deck without a link, doing more than a link's view, comment or edit level allows,
  keeping access after a link is removed or sharing is turned off, or getting past a
  relay's tokens.
- **Add-ins**: code from an add-in escaping the macro sandbox or its task pane's
  sandbox, reaching the network, or doing more than the permissions shown at install.
- **Provider keys** kept by the engine: anything that leaks them.
- **Files**: importing or opening decks, templates, media or archives in a way that
  writes outside where it should.

Bugs that need someone to already control your machine, or to run a modified build
of FormDeck, are ordinary bugs: please open an issue for those.
