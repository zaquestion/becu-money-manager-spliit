// Runs in Money Manager's MAIN world. Wraps fetch/XHR so we can reuse the
// auth headers the MX widget sends, and collects transactions and account
// names from the JSON responses it already loads.
// (Adapted from becu_mx_amz's lib/mx/session.ts.)

// MX transactions are kept as the raw objects the API returns: updates are
// sent back as the whole object, the way the widget does it.
export type RawTransaction = Record<string, unknown> & { guid: string };

const CAPTURE = (name: string) => name === 'md-session-token' || name.startsWith('x-inter-');

export const capturedHeaders: Record<string, string> = {};
export const transactions = new Map<string, RawTransaction>();
export const accountNames = new Map<string, string>();

const listeners = new Set<() => void>();
export const onSessionChange = (fn: () => void) => listeners.add(fn);
const notify = () => listeners.forEach((fn) => fn());

export const rawFetch = window.fetch.bind(window);

export function hasSession(): boolean {
  return 'md-session-token' in capturedHeaders;
}

function captureHeader(name: string, value: string) {
  const key = name.toLowerCase();
  if (CAPTURE(key) && capturedHeaders[key] !== value) {
    capturedHeaders[key] = value;
    notify();
  }
}

function captureHeaderBag(headers: HeadersInit | undefined) {
  if (!headers) return;
  new Headers(headers).forEach((value, name) => captureHeader(name, value));
}

export function rememberTransaction(obj: RawTransaction) {
  if (obj.is_deleted === true) transactions.delete(obj.guid);
  else transactions.set(obj.guid, obj);
  notify();
}

function watchDelete(method: string | undefined, url: string, ok: boolean) {
  if (!ok || method?.toUpperCase() !== 'DELETE') return;
  const m = /\/transactions\/(TRN-[\w-]+)(\/unsplit)?/.exec(url);
  if (m && !m[2]) transactions.delete(m[1]!);
}

// Response shapes aren't documented, so walk any JSON looking for objects
// with MX-style GUIDs.
export function scanEntities(value: unknown, depth = 0) {
  if (depth > 8 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) scanEntities(item, depth + 1);
    return;
  }
  const obj = value as Record<string, unknown>;
  const guid = obj.guid;
  if (typeof guid === 'string') {
    if (guid.startsWith('TRN-') && typeof obj.account_guid === 'string') {
      rememberTransaction(obj as RawTransaction);
    } else if (guid.startsWith('ACT-') && typeof obj.name === 'string') {
      accountNames.set(guid, obj.name);
    }
  }
  for (const child of Object.values(obj)) scanEntities(child, depth + 1);
}

function scanText(text: string) {
  try {
    scanEntities(JSON.parse(text));
  } catch {
    // not JSON
  }
}

export function installHooks() {
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    if (input instanceof Request) captureHeaderBag(input.headers);
    captureHeaderBag(init?.headers);
    const response = await rawFetch(input, init);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    watchDelete(method, response.url || String(input instanceof Request ? input.url : input), response.ok);
    if (response.headers.get('content-type')?.includes('json')) {
      response.clone().text().then(scanText, () => {});
    }
    return response;
  };

  const { open, setRequestHeader, send } = XMLHttpRequest.prototype;
  const methods = new WeakMap<XMLHttpRequest, string>();
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, ...rest: unknown[]) {
    methods.set(this, method);
    return (open as (...args: unknown[]) => void).call(this, method, ...rest);
  } as typeof open;
  XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
    captureHeader(name, value);
    return setRequestHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener('load', () => {
      watchDelete(methods.get(this), this.responseURL, this.status >= 200 && this.status < 300);
      if (this.responseType === '' || this.responseType === 'text') scanText(this.responseText);
      else if (this.responseType === 'json') scanEntities(this.response);
    });
    return send.call(this, body);
  };
}
