// window.postMessage protocol between Money Manager's MAIN world script
// (which holds the MX session) and the ISOLATED world UI (which can reach
// the extension). Spliit data stays on the ISOLATED side: the MAIN side only
// answers MX lookups and edits.
// (Adapted from becu_mx_amz's lib/bridge.ts.)
import type { DrawerTarget } from './mx/match';

const MAIN = 'becu-mx-spliit/main';
const ISOLATED = 'becu-mx-spliit/isolated';

export interface Status {
  hasSession: boolean;
  transactionCount: number;
}

export type Call =
  | { op: 'match'; target: DrawerTarget }
  | { op: 'matchRows'; targets: DrawerTarget[] } // the Transactions list's rows, for Sum and Split
  | { op: 'loaded'; guids: string[] } // which of these Money Manager has loaded
  | { op: 'setMemo'; guid: string; memo: string };

type FromMain =
  | { source: typeof MAIN; kind: 'status'; status: Status }
  | { source: typeof MAIN; kind: 'result'; id: number; ok: boolean; value?: unknown; error?: string };

type FromIsolated =
  | { source: typeof ISOLATED; kind: 'hello' }
  | { source: typeof ISOLATED; kind: 'call'; id: number; call: Call };

function listen<T extends { source: string }>(source: string, fn: (msg: T) => void) {
  window.addEventListener('message', (e) => {
    if (e.source === window && e.origin === location.origin && e.data?.source === source) fn(e.data as T);
  });
}

const post = (msg: FromMain | FromIsolated) => window.postMessage(msg, location.origin);

// MAIN side
export function serveBridge(status: () => Status, handle: (call: Call) => Promise<unknown> | unknown) {
  const send = () => post({ source: MAIN, kind: 'status', status: status() });
  listen<FromIsolated>(ISOLATED, (msg) => {
    if (msg.kind === 'hello') return send();
    Promise.resolve()
      .then(() => handle(msg.call))
      .then(
        (value) => post({ source: MAIN, kind: 'result', id: msg.id, ok: true, value }),
        (err: Error) => post({ source: MAIN, kind: 'result', id: msg.id, ok: false, error: err.message }),
      );
  });
  return send;
}

// ISOLATED side
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

export function connectBridge(onStatus: (s: Status) => void) {
  listen<FromMain>(MAIN, (msg) => {
    if (msg.kind === 'status') return onStatus(msg.status);
    const waiter = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.ok) waiter?.resolve(msg.value);
    else waiter?.reject(new Error(msg.error));
  });
  post({ source: ISOLATED, kind: 'hello' });
}

export function callMain<T = unknown>(call: Call): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    post({ source: ISOLATED, kind: 'call', id, call });
  });
}
