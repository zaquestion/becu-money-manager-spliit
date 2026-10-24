# Chrome Web Store listing

Copy-paste text for the Developer Dashboard. Upload `.output/becu-mx-spliit-<version>-chrome.zip`
(built with `pnpm zip`). Store icon: `store/icon-128.png`. Screenshots (1280×800):
`store/screenshot-1-drawer.png`, `store/screenshot-2-dialog.png`, `store/screenshot-3-settings.png`.
Icons come from `scripts/make-icons.py`. Extension ID: `igmmkkemkiclhbmghflfgacpnonadgbb`.
Firefox: see `firefox-listing.md`.

## Name

Spliit for BECU Money Manager

## Summary (manifest description, max 132 chars)

Add BECU Money Manager transactions to your Spliit groups. Unofficial; not affiliated with BECU, MX or Spliit.

## Category

Tools (or Productivity › Tools)

## Detailed description

Share purchases with roommates, partners or friends straight from your bank's transaction list. Open a transaction in BECU Money Manager, click "Add to Spliit", and it becomes an expense in your Spliit group, already filled in from the bank's details.

Open a transaction in Money Manager, and the Transaction Details panel gets an "Add to Spliit" button. The first time, paste the link to your Spliit group. Then check the title, amount, date, category, who paid and how it's split, and add it.

Features
• Fills in the title, amount, date and category from the bank transaction
• Split evenly, by shares or by amount, with anyone in the group
• Knows what's already in Spliit: the button shows "✓ In Spliit" and links to the expense, from any browser, because the check reads Spliit itself
• Notes the Spliit link and date in the transaction's memo, so your bank history shows what's been shared
• Split rules by category per group, for example "everything under Food and Drink is split by shares"
• Remembers who you are in each group, who you last split with, and the categories you pick
• Warns about pending charges, whose amount can change when they post, and flags charges that look like ones you added while they were pending
• Works with several groups, including groups on a self-hosted Spliit server

Works elsewhere too
BECU Money Manager is built on MX's Money Manager widget (widgets.moneydesktop.com). This extension talks to that widget the same way its own buttons do, so it may also work with Money Manager at other banks and credit unions that use MX. Only BECU has been tested.

Privacy
The extension runs only on widgets.moneydesktop.com. When you add a transaction, it sends that expense to the Spliit group you picked, on spliit.app or on a Spliit server you added. Nothing is collected, tracked, or sent anywhere else. Your settings stay in your browser.

Open source: https://github.com/zaquestion/becu-money-manager-spliit

This is an independent project. It is not made, endorsed, or supported by BECU, MX Technologies or Spliit.

## Single purpose (Privacy practices tab)

Adds transactions from BECU Money Manager (MX Money Manager) to the user's Spliit expense-sharing groups, and notes the added expense in the transaction's memo.

## Permission justifications

**storage:** Saves the user's settings in the browser: their Spliit group links, which group member they are, split rules by category, and the category and split they last chose.

**Host permission (spliit.app):** Creates the expense in the user's Spliit group and looks up whether a transaction was already added, through Spliit's own API. Requests are made only for groups the user added.

**Optional host permissions (any https/http site):** Requested only when the user adds a group on a self-hosted Spliit server, and then only for that server's address. Without it, only spliit.app is reachable.

**Content script on widgets.moneydesktop.com:** Money Manager is hosted there. The script adds the "Add to Spliit" button to the Transaction Details panel and reads the transaction it shows. When the user adds a transaction, it writes the Spliit link into that transaction's memo through Money Manager's own API, using the session the page already has. It does not run on any other site.

## Remote code

No, I am not using remote code. All code is bundled in the package.

## Data usage disclosures

Tick: **Financial and payment information** (transaction payee, amount, date, account name and bank description, which the user chooses to send to their own Spliit group) and **Authentication information** (the extension reuses the page's Money Manager session token to make the same request the page makes when editing a memo).

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

Sending a transaction to the Spliit group the user picked is the item's single purpose, done only when the user clicks "Add to Spliit".

## Privacy policy URL

https://github.com/zaquestion/becu-money-manager-spliit/blob/main/store/listing.md#privacy

## Privacy

Spliit for BECU Money Manager does not collect, sell, or share any personal data, and the developer receives no data. It runs only on widgets.moneydesktop.com. When you click "Add to Spliit", the transaction details you confirm (title, amount, date, category, who paid and the split), plus a note with the bank's description, the account name and Money Manager's IDs for the transaction and account, are sent to the Spliit group you chose, on spliit.app or on a Spliit server you added. Anyone with a Spliit group's link can see its expenses, so share group links accordingly. To check whether a transaction is already in Spliit, the extension searches your groups for that transaction's ID. It writes the Spliit link into the transaction's memo through Money Manager, using your existing signed-in session. Your settings (group links, which member you are, split rules, category choices) are kept in your browser's extension storage and never leave your device. Questions: open an issue at https://github.com/zaquestion/becu-money-manager-spliit/issues
