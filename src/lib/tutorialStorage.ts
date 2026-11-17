/**
 * TutorialOverlay needs a durable dismiss flag in localStorage without
 * non-component exports in the overlay module (that breaks Vite Fast Refresh).
 * Dismissal stores "1" under an internal key; arming the tour again removes it.
 * App decides when to open the tour; callers use the two exported functions so
 * the stored value stays "1".
 */

const TUTORIAL_DISMISSED_KEY = "droiddock-tutorial-dismissed";

export function isTutorialDismissed(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTutorialDismissed(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(TUTORIAL_DISMISSED_KEY, "1");
    else localStorage.removeItem(TUTORIAL_DISMISSED_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}
