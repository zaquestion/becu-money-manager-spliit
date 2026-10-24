# Firefox Add-ons (AMO) listing

Copy-paste text for the [Developer Hub](https://addons.mozilla.org/developers/).
The first version has to be uploaded there by hand. After that, publishing a
GitHub release submits each new version (see `.github/workflows/release.yml`).

Upload `.output/becu-mx-spliit-<version>-firefox.zip` and, when asked for source
code, `.output/becu-mx-spliit-<version>-sources.zip` (both built with
`pnpm zip:firefox`). Icon and screenshots: the same files as the Chrome listing
(`listing.md`). Add-on ID: `becu-money-manager-spliit@zaquestion.github.io`.

API keys for CI (Developer Hub → Tools → Manage API Keys) go in the repo
secrets `FIREFOX_JWT_ISSUER` and `FIREFOX_JWT_SECRET`.

## Name

Spliit for BECU Money Manager

## Summary (max 250 chars)

Add BECU Money Manager transactions to your Spliit groups. Unofficial; not affiliated with BECU, MX or Spliit.

## Description

Same as the Chrome listing's detailed description (`listing.md`).

## Categories

Other

## License

GNU Affero General Public License v3.0 or later (pick "GNU Affero General Public
License, version 3.0" in the Developer Hub; the repo's `LICENSE` file).

## Support

- Website: https://github.com/zaquestion/becu-money-manager-spliit
- Support site: https://github.com/zaquestion/becu-money-manager-spliit/issues

## Privacy policy

The "Privacy" section of `listing.md`.

## Data collection

Declared in the manifest (`wxt.config.ts`), and shown to the user at install:
**Financial and payment information**, required. The transactions the user
adds are sent to the Spliit server they chose. Nothing goes to the developer.

## Notes to reviewer

The extension is built with WXT (Vite) from TypeScript. To reproduce the
uploaded zip from the sources zip, with Node 22 and pnpm (version in
`package.json`'s `packageManager`):

    pnpm install --frozen-lockfile
    pnpm zip:firefox

The output is `.output/becu-mx-spliit-<version>-firefox.zip`.

It runs only on widgets.moneydesktop.com, where BECU's Money Manager is
hosted. The MAIN-world content script wraps fetch/XHR to read the
transactions the page loads and its session token, which is used for one
request: writing the Spliit link into a transaction's memo, the same `PUT`
the page sends when the user edits a memo. The background script calls
Spliit's API on spliit.app, or on a self-hosted Spliit server the user adds
(requested as an optional host permission for that origin only). No remote
code, no analytics.

Testing needs a BECU online banking account, so screenshots are in the
listing. Spliit groups need no account: https://spliit.app lets anyone create
a group to try the Spliit side.
