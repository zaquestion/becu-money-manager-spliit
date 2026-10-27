import { defineContentScript } from '#imports';
import { serveBridge } from '@/lib/bridge';
import { setMemo } from '@/lib/mx/api';
import { matchDrawer, matchRows } from '@/lib/mx/match';
import { accountNames, hasSession, installHooks, onSessionChange, transactions } from '@/lib/mx/session';

export default defineContentScript({
  matches: ['https://widgets.moneydesktop.com/*'],
  allFrames: true,
  runAt: 'document_start',
  // MAIN world so our fetch/XHR wrappers see the widget's own requests.
  world: 'MAIN',
  main() {
    installHooks();
    if (!location.pathname.startsWith('/md/')) return;
    const send = serveBridge(
      () => ({ hasSession: hasSession(), transactionCount: transactions.size }),
      (call) => {
        switch (call.op) {
          case 'match':
            return matchDrawer(call.target, transactions.values(), accountNames);
          case 'matchRows':
            return matchRows(call.targets, transactions.values(), accountNames);
          case 'loaded':
            return call.guids.filter((g) => transactions.has(g));
          case 'setMemo':
            return setMemo(call.guid, call.memo);
        }
      },
    );
    // Data trickles in as the widget loads; batch the updates.
    let timer = 0;
    onSessionChange(() => {
      clearTimeout(timer);
      timer = window.setTimeout(send, 200);
    });
  },
});
