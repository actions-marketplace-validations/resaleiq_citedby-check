# Changelog

## 0.1.1

- A robots.txt that answers a server error (HTTP 500 to 599) is now reported as Fix: RFC 9309 says a crawler must then assume the whole site is disallowed. Before, it read as "No robots.txt found, so nothing is blocked". One that could not be loaded at all is Not checked.
- README: the Result column, the llms.txt row and the limits now match what the check does, and the sample output shows the full run.
- `npm test` runs on Node 22 and later.

## 0.1.0

First release.

- `citedby-check <address>`: runs the free citedby.eu check and prints one block per check with the fix.
- Options: `--fail-on fail|warn|never`, `--lang`, `--json`, `--quiet`, `--no-color`, `--source`, `--api-url`.
- Exit codes: 0 nothing at or above `--fail-on`, 1 something to fix, 2 wrong use, 3 not measured.
- GitHub Action (`uses: resaleiq/citedby-check@v0`): job summary, annotations, step outputs.
