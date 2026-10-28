/**
 * The as-is agreement has to be remembered or the first-run screen would
 * return on every launch. Stores "1" after the person continues. A failed
 * read counts as not accepted so the screen stays up. Callers decide when
 * to show it; this module only keeps the flag.
 */

const AS_IS_ACCEPTED_KEY = "droiddock-as-is-accepted";

export function isAsIsAccepted(): boolean {
  try {
    return localStorage.getItem(AS_IS_ACCEPTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAsIsAccepted(): void {
  try {
    localStorage.setItem(AS_IS_ACCEPTED_KEY, "1");
  } catch {
    /* ignore quota / private mode — the in-memory accept still opens the app */
  }
}
