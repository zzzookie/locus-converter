/**
 * Типизированный HTTP-клиент к локальному серверу.
 */

interface ErrorPayload {
  error: string;
}

function isErrorPayload(data: unknown): data is ErrorPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error?: unknown }).error === 'string'
  );
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const options: RequestInit =
    body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };

  const response = await fetch(path, options);
  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(isErrorPayload(data) ? data.error : `HTTP ${response.status}`);
  }
  return data as T;
}
