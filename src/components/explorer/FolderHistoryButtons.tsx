/**
 * Back, forward, and refresh for each pane’s path row — browser-like navigation
 * without relying on breadcrumb parent clicks alone. Refresh reloads the folder
 * these controls navigate, not the app-wide Sync or phone scan actions in the
 * top bar. The parent owns history stacks and defines what refresh loads for
 * that pane only.
 */

interface FolderHistoryButtonsProps {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  /** True while a copy question / scan lock should block reload. */
  refreshDisabled?: boolean;
  /** e.g. “Phone folder history” */
  ariaLabel: string;
  /** Spotlight target id for the one-time tutorial overlay. */
  tutorialTarget?: string;
}

export function FolderHistoryButtons({
  canBack,
  canForward,
  onBack,
  onForward,
  onRefresh,
  refreshDisabled = false,
  ariaLabel,
  tutorialTarget,
}: FolderHistoryButtonsProps) {
  return (
    <div
      className="pane-history-btns"
      role="group"
      aria-label={ariaLabel}
      data-tutorial={tutorialTarget}
    >
      <button
        type="button"
        className="pane-history-btn"
        onClick={onBack}
        disabled={!canBack}
        aria-label="Back"
        title="Back"
      >
        ←
      </button>
      <button
        type="button"
        className="pane-history-btn"
        onClick={onForward}
        disabled={!canForward}
        aria-label="Forward"
        title="Forward"
      >
        →
      </button>
      <button
        type="button"
        className="pane-history-btn"
        onClick={onRefresh}
        disabled={refreshDisabled}
        aria-label="Refresh this folder"
        title="Refresh this folder"
      >
        ↻
      </button>
    </div>
  );
}
