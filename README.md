# Spliit for BECU Money Manager

Chromium extension (TypeScript + [WXT](https://wxt.dev)) that adds an
**Add to Spliit** button to a transaction's details in BECU Money Manager
(MX's widget at `widgets.moneydesktop.com`), so shared purchases go into a
[Spliit](https://github.com/spliit-app/spliit) group straight from the bank's
list. Companion to `becu_import` and `becu_mx_amz`.

## Build & load

```sh
pnpm install
pnpm build           # or `pnpm dev` for live reload
pnpm test
```

Open `chrome://extensions`, enable Developer mode, click **Load unpacked** and
pick `.output/chrome-mv3`.

## Use

1. In Money Manager, click a transaction. The Transaction Details drawer gets
   an **Add to Spliit** button under the amount.
2. The first time, paste a Spliit group link (from Spliit's Share button or the
   address bar). More groups can be added from the dialog's group menu or the
   settings page (⚙).
3. Check the title, amount, date, category, who paid and who it's split with
   (evenly, by shares or by amount), then **Add to Spliit**.
4. The Spliit expense is created and the transaction's memo gets
   `Spliit 2026-10-23 (House): https://spliit.app/groups/…/expenses/…/edit`
   appended. Reload Money Manager to see the memo.

From then on, the drawer button reads **✓ In Spliit** for that transaction (its
tooltip says which group and when) and the dialog links to the expense, with
**Add again anyway** for adding it to another group.

The dialog remembers, per group, who you are and who you last split with, and,
per Money Manager category, which Spliit category you picked.

### Split rules

On the settings page, each group can have split rules by Spliit category:
evenly or by shares, with who's included and each person's share count. A
rule can cover one category (Groceries) or a whole group of them (All Food
and Drink); a rule for one category wins over one for its group. When the
dialog's category has a rule, the split starts from it (it says which rule)
and follows the category if you change it. Editing the split by hand stops
that for this expense, and a rule's split isn't saved as the "last split" for
categories without one.

## How "already in Spliit" works

Everything needed is stored in Spliit, in the expense's notes:

```
Added from BECU Money Manager on 2026-10-23
AMAZON MKTPLACE PMTS · Amazon Prime Rewards Visa Signature · $18.73 · 2026-10-21
[mx:TRN-f587d005-…] [mx-fp:ACT-5adea6ca-…:-1873]
```

Anything typed into the dialog's Notes field goes above that block.

- `[mx:TRN-…]` is the MX transaction guid. Spliit's expense search
  (`groups.expenses.list` with `filter`) matches notes, so looking up the
  marker finds the expense; its notes are then read to confirm the match. This
  works from any browser, since nothing is kept locally.
- `[mx-fp:ACT-…:±cents]` is the account and signed amount. When a pending
  charge posts, MX can replace it with a new guid. An expense with the same
  fingerprint dated within 10 days, added from a transaction Money Manager no
  longer shows, is flagged as **Possibly already in Spliit**.

Deleting the expense in Spliit makes the transaction addable again. The memo
note stays until you edit it out.

## How it works

- **Money Manager side** (as in `becu_mx_amz`): a MAIN-world script wraps
  fetch/XHR to reuse the widget's `md-session-token` and collect the
  transactions and account names it loads. The UI runs in the ISOLATED world
  and talks to it over `window.postMessage`.
- **Matching the drawer**: the drawer doesn't expose the guid, so the
  transaction is matched on what it shows. The amount must be the same and the
  date within a day; payee, account, bank description and memo break ties. If
  two transactions still can't be told apart, the dialog asks which one.
- **Memo**: `PUT /transactions/{guid}` with the whole transaction object, the
  same request the widget sends when you edit it.
- **Spliit side** (`lib/spliit/`): the background worker calls Spliit's tRPC
  API the way its web client does (`GET /api/trpc/<proc>?input={"json":…}`,
  `POST` for `groups.expenses.create` with superjson's `Date` tag). Its host
  permission gets past CORS. Spliit has no accounts: a group's id is its key.
  Amounts are cents; shares are sent in the units Spliit's form sends after
  its own conversion (×100 for even/shares splits, cents for by-amount).
  Refunds and credits become negative expenses.
- **Self-hosted Spliit**: groups on other servers work. Add them from the
  settings page so Chrome can ask for access to that origin.

## Limits / unverified

- Duplicate detection relies on Spliit's search covering notes (spliit #601).
  After each add, the extension searches for the new expense and warns if it
  can't be found that way.
- The drawer's memo field isn't refreshed after the memo is written. If you
  edit that memo before reloading, Money Manager saves its stale copy over the
  Spliit note.
- MX's memo length limit is unknown. Long existing memos plus the link might be
  cut off or rejected (the dialog reports the error and the Spliit expense
  stays).
- Pending charges (bank feed transactions with no `posted_date`, i.e.
  `is_manual: false` and `posted_date: null`) can be added, with a warning in the
  dialog, and the Spliit notes say "pending". If the charge posts for a
  different amount, the look-alike check (exact amount) won't flag it, and the
  memo note is lost if Money Manager replaces the transaction.
- Groups in a currency other than USD get the USD amount as is (with a
  warning). No conversion is done.
- By-amount splits can't be used for refunds: Spliit rejects shares of zero or
  less.
