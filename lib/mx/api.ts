// MX widget API calls, matching the requests the widget itself sends: an
// edit is a PUT of the whole transaction object (see becu_mx_amz's mx_split).
import type { RawTransaction } from './session';
import { capturedHeaders, rawFetch, rememberTransaction, transactions } from './session';

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await rawFetch(new URL(path, location.origin), {
    method,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...capturedHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Money Manager said HTTP ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export async function setMemo(guid: string, memo: string): Promise<void> {
  const tx = transactions.get(guid);
  if (!tx) throw new Error(`Transaction ${guid} isn't loaded; reload Money Manager`);
  const result = await request('PUT', `/transactions/${encodeURIComponent(guid)}`, { ...tx, memo });
  const updated = (result as { transaction?: RawTransaction })?.transaction;
  if (updated?.guid) rememberTransaction(updated);
}
