# Changelog

## 0.1.0

First release.

- `citedby-check <address>`: runs the free citedby.eu check and prints one block per check with the fix.
- Options: `--fail-on fail|warn|never`, `--lang`, `--json`, `--quiet`, `--no-color`, `--source`, `--api-url`.
- Exit codes: 0 nothing at or above `--fail-on`, 1 something to fix, 2 wrong use, 3 not measured.
- GitHub Action (`uses: resaleiq/citedby-check@v0`): job summary, annotations, step outputs.
