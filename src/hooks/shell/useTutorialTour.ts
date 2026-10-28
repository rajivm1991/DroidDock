/**
 * When the first-run tour is open, and putting the phone into List view for
 * the sort step. The previous view comes back when the tour closes.
 * TutorialOverlay draws the card.
 */
import { SetStateAction, useEffect, useRef, useState } from "react";
import { setTutorialDismissed, isTutorialDismissed } from "../../lib/tutorialStorage";
import { tutorialStepNeedsListView } from "../../components/setup/TutorialOverlay";

export interface UseTutorialTourArgs {
  adbAvailable: boolean | null;
  /** False while the as-is notice is up, so the tour does not start behind it. */
  asIsAccepted: boolean;
  setViewMode: (value: SetStateAction<"table" | "grid" | "column">) => void;
  viewMode: "table" | "grid" | "column";
}

export function useTutorialTour({
  adbAvailable,
  asIsAccepted,
  setViewMode,
  viewMode,
}: UseTutorialTourArgs) {
  /**
   * First dual-pane visit needs a short tour; everyday chrome stays quiet after
   * dismiss. One-time TutorialOverlay; Settings can open it again. Sort-in-List forces
   * phone List view from that step until the tour ends, then restores the view that was
   * open when the tour started. Does not show every launch or replace the shortcuts
   * dialog.
   */
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const tutorialAutoShownRef = useRef(false);
  const phoneViewBeforeTutorialRef = useRef<"table" | "grid" | "column" | null>(
    null,
  );
  /** Fresh view for tutorial open/restore (timers must not capture a stale mode). */
  const phoneViewModeRef = useRef(viewMode);
  phoneViewModeRef.current = viewMode;

  function openTutorial() {
    phoneViewBeforeTutorialRef.current = phoneViewModeRef.current;
    setTutorialOpen(true);
  }

  function closeTutorial(dismissed: boolean) {
    if (dismissed) setTutorialDismissed(true);
    setTutorialOpen(false);
    const saved = phoneViewBeforeTutorialRef.current;
    phoneViewBeforeTutorialRef.current = null;
    if (saved != null && saved !== phoneViewModeRef.current) {
      setViewMode(saved);
    }
  }

  function handleTutorialStepChange(step: { id: string }) {
    if (tutorialStepNeedsListView(step.id)) {
      if (phoneViewModeRef.current !== "table") setViewMode("table");
      return;
    }
    const saved = phoneViewBeforeTutorialRef.current;
    if (saved != null && phoneViewModeRef.current !== saved) setViewMode(saved);
  }

  /**
   * Show the tour once when the dual-pane shell first appears (after ADB is ready
   * and the as-is notice has been accepted), not on every launch. Open
   * TutorialOverlay after a short layout settle if not dismissed. Does not
   * re-open after Skip/Done unless Settings clears the flag, and does not
   * start while the as-is notice is still covering the window.
   */
  useEffect(() => {
    if (adbAvailable !== true) return;
    if (!asIsAccepted) return;
    if (tutorialAutoShownRef.current) return;
    if (isTutorialDismissed()) return;
    tutorialAutoShownRef.current = true;
    const timer = window.setTimeout(() => openTutorial(), 500);
    return () => window.clearTimeout(timer);
  }, [adbAvailable, asIsAccepted]);

  return {
    tutorialOpen,
    openTutorial,
    closeTutorial,
    handleTutorialStepChange,
  };
}
