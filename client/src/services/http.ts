import axios from 'axios';

/**
 * Shared axios instance for auth calls.
 *
 * axios has no default timeout, so a backend that accepts the TCP connection but never
 * responds (a crash-looping or sleeping host) leaves every request pending forever — the
 * promise neither resolves nor rejects, so the UI shows no error and no success. A timeout
 * turns that silence into a message the user can act on.
 */
export const http = axios.create({
  // Generous: a free-tier host that has spun down can take ~50s to answer the first request.
  timeout: 60_000,
});

/** Human-readable reason for a failed request, preferring the API's own error message. */
export function describeRequestError(err: unknown): string {
  const e = err as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { error?: string } };
  };

  const fromApi = e?.response?.data?.error;
  if (fromApi) return fromApi;

  if (e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message ?? '')) {
    return 'The server did not respond in time. It may be starting up — wait a moment and try again. If this keeps happening, the API is probably down.';
  }
  if (e?.code === 'ERR_NETWORK') {
    return 'Could not reach the server. Check that the API is running and that this site is listed in the API\'s CLIENT_ORIGIN.';
  }
  if (e?.response?.status) {
    return `Request failed (${e.response.status}).`;
  }
  return e?.message || 'Request failed.';
}
