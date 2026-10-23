# citedby-check

Check whether AI-search crawlers can read your site, from a terminal or a GitHub Action. Free. No account or API key.

```
$ npx github:resaleiq/citedby-check example.com
AI-search readiness check for example.com
citedby.eu loaded the site from outside: plain HTTP, no JavaScript.

  OK          AI crawlers allowed in robots.txt
              No robots.txt found, so nothing is blocked.
  FIX         Text in the page HTML
              Only 27 words are readable without JavaScript. Fix: render the
              homepage text on the server, so a crawler that does not run
              JavaScript still reads it.
  FIX         Organization data (JSON-LD)
              No Organization or LocalBusiness data. Fix: add it as JSON-LD on
              the homepage with your name, logo, address or contact and social
              profiles, so assistants get your basic facts from one place.
  NOT CHECKED Product data (JSON-LD), Price in product data, Availability in
              product data, GTIN or barcode in product data
              No product page was found from the home page, so product data was
              not checked.
  OPTIONAL    llms.txt
              No llms.txt. Optional hygiene: it is cheap to add, but we do not
              expect it to change what AI assistants answer.

1 of 3 checks passed. 2 to fix.
```

Output of a real run on example.com. The command exits with 1 because two checks need a fix.

## Run it

```sh
npx github:resaleiq/citedby-check example.com
```

You need Node 18 or newer and git. The package is not on the npm registry yet, so the command runs straight from GitHub. To keep it installed:

```sh
npm install -g github:resaleiq/citedby-check
citedby-check example.com
```

## What it checks

citedby.eu loads `robots.txt`, your home page and `llms.txt` with a plain HTTP request, the way a crawler without a browser does. If it finds a product page (a link on the home page, or a Shopify product feed), it loads that page too. It identifies itself as `CitedByCheck/1.0 (+https://citedby.eu/check)`.

| Check | What it looks at | Result |
| --- | --- | --- |
| AI crawlers in robots.txt | Whether OAI-SearchBot, GPTBot, PerplexityBot, Google-Extended or Bingbot is shut out of the home page | OK or Fix |
| Text in the page HTML | Words a crawler reads without running JavaScript: 200 or more is OK, 50 to 199 is Check, fewer is Fix | OK, Check or Fix |
| Organization data | Organization, LocalBusiness or a similar business type as JSON-LD on the home page | OK or Fix |
| Product data | Product JSON-LD, price, availability and GTIN on one product page, when the check finds one | OK, Check, Fix or Not checked |
| llms.txt | Whether the file exists | OK or Optional |

If your firewall turns the checker away, the result says your site refused the request. That is worth a look: it may refuse AI crawlers too.

## Options

```
citedby-check <address> [options]

--fail-on <level>   exit 1 when a check reaches this level: fail (default), warn or never
--lang <code>       language your site is asked for: en (default), fr, de, es or nl
--json              print the raw result as JSON
-q, --quiet         print only the summary line
--no-color          no colors (NO_COLOR is honored too)
--source <tag>      tag sent with the check so citedby.eu can count runs (default: cli)
--api-url <url>     another endpoint for the check
```

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Nothing at or above `--fail-on` |
| 1 | At least one check at or above `--fail-on` |
| 2 | Wrong use, such as a missing address or an unknown option |
| 3 | Not measured: rate limit, your site refused or did not answer the checker, or no usable answer from citedby.eu |

A check that did not run is never reported as a pass.

List the failing checks in a script:

```sh
citedby-check example.com --json | jq -r '.checks[] | select(.status == "fail") | .id'
```

## GitHub Action

Run it after a deploy, or on a schedule:

```yaml
name: AI-search readiness
on:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: resaleiq/citedby-check@v0
        with:
          url: https://example.com
```

The step fails when a check comes back as Fix. It writes the result to the job summary, marks each problem as an annotation and sets outputs.

| Input | Default | Meaning |
| --- | --- | --- |
| `url` | required | Address of the public site to check |
| `fail-on` | `fail` | `fail`, `warn` or `never` |
| `lang` | `en` | Language your site is asked for: `en`, `fr`, `de`, `es` or `nl` |
| `fail-on-error` | `false` | Also fail the step when the check could not run |
| `source` | `action` | Tag for the run count; any other value opts out |

Outputs: `result` (`pass`, `check`, `fix` or `not-measured`), `passed`, `total`, `fix-count` and `check-count`.

The free check allows a few runs an hour per site and per connection. A run that hits the limit is reported as not measured with a warning, and it only fails your build when `fail-on-error` is `true`.

## What is sent

The address, the language code and the tag (`cli`, or `action` in the Action) go to `https://citedby.eu/api/check`. citedby.eu loads your site from its own servers and adds one to a daily counter for the tag and one to its overall count of checks. Your IP address reaches citedby.eu as it does with any request. The CLI has no telemetry, no cookies and no account, and writes no files. Privacy policy: https://citedby.eu/privacy

`--source none` stops the tag. The check still runs.

citedby.eu checks sites from outside, so `localhost`, private network addresses and pages behind a login cannot be checked.

## What it does not tell you

A pass means a crawler can read the pages the check loads. It does not say that an AI assistant will mention or cite your site, and it covers the home page and at most one product page.

The full audit crawls your site up to your plan's page limit and gives the exact fix for each problem: https://citedby.eu/?utm_source=github&utm_medium=referral&utm_campaign=citedbycheck_202610&utm_content=readme_01

## Development

```sh
git clone https://github.com/resaleiq/citedby-check
cd citedby-check
npm test
```

There are no dependencies. The tests use Node's test runner and a local stand-in for the API, so they need no network. The checks themselves run on citedby.eu; this repository turns their answer into a terminal report, exit codes and an Action. Issues and pull requests are welcome.

## License

MIT. Made by [CitedBy](https://citedby.eu/?utm_source=github&utm_medium=referral&utm_campaign=citedbycheck_202610&utm_content=readme_02).
