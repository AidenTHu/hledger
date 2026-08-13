# hledger-web browser tests

End-to-end tests for the hledger-web UI, using [Playwright](https://playwright.dev).
Unlike the yesod-test suite (`Hledger/Web/Test.hs`), these run a real browser,
so they cover hledger-web's javascript: the add-transaction form, in-page (AJAX)
navigation, keyboard shortcuts, autocomplete, and search.

Each test run starts its own hledger-web on port 5099 (override with
`HLEDGER_WEB_PORT`) against a scratch copy of `fixture.journal`, and stops it
afterwards.

## Setup (once)

    cd hledger-web/test/e2e
    npm install
    npx playwright install chromium

## Run

    # using a hledger-web binary on $PATH:
    npx playwright test

    # or specify how to run hledger-web:
    HLEDGER_WEB="stack exec -- hledger-web" npx playwright test

    # watch the browser while it runs:
    npx playwright test --headed

    # run one test:
    npx playwright test -g "adds a transaction"
