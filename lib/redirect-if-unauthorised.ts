/**
 * Client helper: if an API call comes back 401 (session expired or signed
 * out), send the priest to /login instead of leaving a broken panel.
 * Returns true when it has redirected, so the caller can stop.
 */
export function redirectIfUnauthorised(res: Response): boolean {
  if (res.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}
