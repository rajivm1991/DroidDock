/**
 * One-time spotlight tour over the live dual-pane UI: dual pane, selection,
 * copy paths, navigation, views and sort, Mac privacy, Sync, and Settings start
 * folder. Body copy uses short paragraphs, lists, and tips with explicit
 * wording for both copy directions. Card size is measured per step — no inner
 * scroll — with a calm aspect ratio in the viewport. Shown when the shell opens
 * until Skip, Done, or Escape; dismissal persists in localStorage and Settings
 * can reopen the tour. Does not replace Settings or cover every shortcut.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Structured body so the card can space / style blocks without a text wall. */
type BodyBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "tip"; text: string };

type TutorialStep = {
  id: string;
  title: string;
  body: BodyBlock[];
  /** Matches `[data-tutorial="…"]` on live chrome; missing → centered card. */
  target?: string;
};

/** Sort-in-List beat — App switches phone view to List while this step (or later) is shown. */
export const TUTORIAL_LIST_SORT_STEP_ID = "list-sort";

/** Steps run top-down through layout, selection (including Cmd+A), each copy method, navigation, views, Mac privacy, Sync, then Settings. */
const STEPS: TutorialStep[] = [
  {
    id: "dual-pane",
    title: "Phone and This Mac",
    body: [
      {
        kind: "p",
        text: "The left side shows files on your phone. The right side shows files on This Mac.",
      },
      {
        kind: "p",
        text: "You can open folders on both sides here. You can also copy files from one side to the other. The next steps explain how to select files and how to copy them.",
      },
    ],
    target: "dual-pane",
  },
  {
    id: "one-selection",
    title: "One side at a time",
    body: [
      {
        kind: "p",
        text: "If you select files on the phone, any selection on This Mac is cleared.",
      },
      {
        kind: "p",
        text: "If you select files on This Mac, any selection on the phone is cleared.",
      },
      {
        kind: "p",
        text: "This way you always know which side the files will be copied from.",
      },
      {
        kind: "tip",
        text: "Press Command-A to select every file you can see on the side you last clicked. You can click empty space in that list first, then press Command-A.",
      },
    ],
    target: "dual-pane",
  },
  {
    id: "copy-intro",
    title: "Where copies go",
    body: [
      {
        kind: "p",
        text: "When you copy files once, they go into the folder that is already open on the side that receives them.",
      },
      {
        kind: "p",
        text: "Open that folder first. Use the place-mark buttons or the folder path near the top of that side.",
      },
      {
        kind: "p",
        text: "There are four ways to start a copy. The next steps explain each one:",
      },
      {
        kind: "list",
        items: [
          "Use the Copy selection button",
          "Use the right-click menu",
          "Drag from Finder onto this window (into the phone)",
          "Drag from one side of this window to the other",
        ],
      },
      {
        kind: "tip",
        text: "Later you will see Sync. Sync is different. Sync keeps a Mac folder and a phone folder matching each other over time. It is not the same as copying files once.",
      },
    ],
    target: "dual-pane",
  },
  {
    id: "selection-strip",
    title: "Copy with the button",
    body: [
      {
        kind: "p",
        text: "Select one or more files on one side. A bar of actions appears above that list.",
      },
      {
        kind: "p",
        text: "Press the Copy selection button. The button text names the open folder on the other side. Example: “Copy selection to Downloads on This Mac.” The files go into that named folder.",
      },
      {
        kind: "list",
        items: [
          "On the phone, the bar also has Preview (for one file) and Delete",
          "Clear selection removes your selection",
          "How many files you selected, and their total size, show in the status bar at the bottom",
        ],
      },
    ],
    target: "phone-selection-strip",
  },
  {
    id: "context-menu",
    title: "Copy from the menu",
    body: [
      {
        kind: "p",
        text: "Right-click a file, or right-click after you select several files.",
      },
      {
        kind: "p",
        text: "The first menu item is the same Copy selection action as the button. It uses the same words for the folder that will receive the files.",
      },
      {
        kind: "tip",
        text: "This menu belongs to DroidDock. It is not the normal macOS menu.",
      },
      {
        kind: "list",
        items: [
          "On the phone, the menu can also Preview, Rename, or Delete that file",
          "On This Mac, if no phone is connected, the menu only offers Open in Finder and Copy absolute path",
        ],
      },
    ],
    target: "phone-file-list",
  },
  {
    id: "finder-drag",
    title: "Drop from Finder onto the phone",
    body: [
      {
        kind: "p",
        text: "In Finder (the Mac file windows), drag files or folders into this DroidDock window.",
      },
      {
        kind: "p",
        text: "Those files always copy into the open folder on the phone. They never copy into This Mac inside DroidDock, even if your mouse is over the Mac side.",
      },
      {
        kind: "list",
        items: [
          "The first time, a tip asks you to confirm before copying",
          "After that, if a file with the same name already exists, you will be asked whether to replace it or keep both",
          "In Columns view, drop only on the column labeled Open",
        ],
      },
      {
        kind: "tip",
        text: "If you want to move files only between folders on your Mac, use Finder. Do not use this drop into DroidDock for that.",
      },
    ],
    target: "phone-pane",
  },
  {
    id: "in-app-drag",
    title: "Drag from one side to the other",
    body: [
      {
        kind: "p",
        text: "Select files on the phone, then drag them onto This Mac. Or select files on This Mac, then drag them onto the phone.",
      },
      {
        kind: "p",
        text: "The files copy into the folder that is open on the side you drop onto.",
      },
      {
        kind: "list",
        items: [
          "A plus cursor means you can drop here",
          "A stop cursor means you cannot drop here (for example on the side you started from, on the top buttons, or on a Columns column that is not labeled Open)",
          "If you let go on the starting side, or outside both sides, nothing is copied",
        ],
      },
      {
        kind: "tip",
        text: "This kind of drag does not show the Finder tip. If names already exist, you get the same replace-or-keep questions as when you use the Copy selection button.",
      },
    ],
    target: "dual-pane",
  },
  {
    id: "places",
    title: "Place marks",
    body: [
      {
        kind: "p",
        text: "Place marks are buttons for common folders. They use full names so you can find them easily.",
      },
      {
        kind: "list",
        items: [
          "On the phone: Internal storage, Camera, Screenshots, Downloads",
          "On This Mac: Home, Desktop, Documents, Downloads",
        ],
      },
      {
        kind: "tip",
        text: "The place marks and the folder path stay on one line. If there are many, you can scroll sideways to see the rest.",
      },
    ],
    target: "phone-places",
  },
  {
    id: "add-preset",
    title: "Save a shortcut",
    body: [
      {
        kind: "p",
        text: "Press the + button next to the place marks to save a shortcut to a folder you use often.",
      },
      {
        kind: "p",
        text: "If you have a folder selected, that folder is saved. If nothing is selected, the folder that is open is saved.",
      },
      {
        kind: "list",
        items: [
          "Phone shortcuts and Mac shortcuts are saved separately",
          "The usual folders (like Internal storage or Home) are already there and stay there",
          "Your own shortcuts show an × so you can remove them. You can also remove them in Settings",
        ],
      },
    ],
    target: "phone-add-preset",
  },
  {
    id: "folder-history",
    title: "Back, Forward, and Refresh",
    body: [
      {
        kind: "p",
        text: "Each side has three buttons next to the folder path:",
      },
      {
        kind: "list",
        items: [
          "← goes back to the previous folder you opened on that side",
          "→ goes forward again on that side",
          "↻ reloads the folder that is open on that side only. It does not reload the other side",
        ],
      },
      {
        kind: "tip",
        text: "The ↻ button next to Phone at the very top of the window is different. That one only looks for connected phones. It does not reload your open folder.",
      },
    ],
    target: "phone-folder-history",
  },
  {
    id: "views",
    title: "List, Icons, and Columns",
    body: [
      {
        kind: "p",
        text: "You can change how files look on each side:",
      },
      {
        kind: "list",
        items: [
          "List and Columns show a small icon next to each file name",
          // Previews can zoom past the usual Icons size, so the tour should not call them small.
          "Icons shows larger icons. If Show Thumbnails is on in Settings, photos and videos can show a preview, and Icons can zoom larger than usual",
        ],
      },
    ],
    target: "phone-views",
  },
  {
    id: "list-sort",
    title: "Sort in List",
    body: [
      {
        kind: "p",
        text: "In List view, click the column title Name, Size, or Date to sort the files.",
      },
      {
        kind: "p",
        text: "Click the same title again to sort in the opposite order (for example A–Z, then Z–A).",
      },
      {
        kind: "list",
        items: [
          "This works the same on the phone and on This Mac",
          "The Kind column only shows a label. Clicking Kind does not sort",
        ],
      },
      {
        kind: "tip",
        text: "If you are in Icons or Columns and want to change the sort order, switch to List first, change the sort, then switch back if you like.",
      },
    ],
    target: "phone-list-sort",
  },
  {
    id: "mac-privacy",
    title: "Mac privacy",
    body: [
      {
        kind: "p",
        text: "macOS may block Desktop, Documents, and Downloads until you allow access.",
      },
      {
        kind: "p",
        text: "You may need to press Grant access (this opens a system folder picker) or turn on Full Disk Access in System Settings.",
      },
      {
        kind: "p",
        text: "If a folder is blocked, DroidDock shows a card with only the steps you still need to do.",
      },
      {
        kind: "tip",
        text: "A file can appear in the list but still fail to copy if the installed app does not have permission. Use Grant access or Full Disk Access on the real installed app to fix that.",
      },
    ],
    target: "mac-pane",
  },
  {
    id: "sync",
    title: "Sync folders",
    body: [
      {
        kind: "p",
        text: "Sync links one folder on your Mac with one folder on your phone.",
      },
      {
        kind: "p",
        text: "When you run Sync, DroidDock updates those folders so they stay matching over time.",
      },
      {
        kind: "tip",
        text: "Sync is not the same as copying selected files once with the button, the menu, or drag and drop.",
      },
    ],
    target: "sync",
  },
  {
    id: "settings-start",
    title: "Phone start folder",
    body: [
      {
        kind: "p",
        text: "In Settings, you can choose which phone folder opens when a phone connects.",
      },
      {
        kind: "list",
        items: [
          "The default is Camera",
          "If that folder is missing or empty, Internal storage opens instead",
        ],
      },
    ],
    target: "settings",
  },
];

/** True from the Sort in List beat through the end of the tour. */
export function tutorialStepNeedsListView(stepId: string): boolean {
  const listIndex = STEPS.findIndex((s) => s.id === TUTORIAL_LIST_SORT_STEP_ID);
  const stepIndex = STEPS.findIndex((s) => s.id === stepId);
  return listIndex >= 0 && stepIndex >= listIndex;
}

type SpotlightRect = { top: number; left: number; width: number; height: number };

interface TutorialOverlayProps {
  open: boolean;
  onClose: (dismissed: boolean) => void;
  /** Notifies the parent of the active step so List view can show column headers for the sort beat and restore afterward. */
  onStepChange?: (step: { id: string; index: number }) => void;
}

function readTargetRect(target: string | undefined): SpotlightRect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tutorial="${target}"]`);
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const pad = 6;
  return {
    top: Math.max(8, r.top - pad),
    left: Math.max(8, r.left - pad),
    width: Math.min(window.innerWidth - 16, r.width + pad * 2),
    height: Math.min(window.innerHeight - 16, r.height + pad * 2),
  };
}

function renderBody(blocks: BodyBlock[]): ReactNode {
  return (
    <div className="tutorial-body">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "p":
            return (
              <p key={index} className="tutorial-body-p">
                {block.text}
              </p>
            );
          case "list":
            return (
              <ul key={index} className="tutorial-body-list">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          case "tip":
            return (
              <p key={index} className="tutorial-body-tip">
                {block.text}
              </p>
            );
          default: {
            const _exhaustive: never = block;
            return _exhaustive;
          }
        }
      })}
    </div>
  );
}

type CardLayout = {
  width: number;
  height: number;
  top: number;
  left: number;
};

/**
 * Picks the smallest card width that fits the viewport and a calm height/width
 * ratio for this step’s copy — widen when text is tall, shrink when short.
 * Height follows content with no inner scroll or padded empty band.
 */
function fitCardSize(card: HTMLElement): { width: number; height: number } {
  const margin = 16;
  const minW = 260;
  const maxW = Math.min(560, window.innerWidth - margin * 2);
  const maxH = window.innerHeight - margin * 2;
  /** Prefer not taller than this vs width (widen instead). */
  const maxHOverW = 1.2;
  /** Prefer not wider than this vs height (do not stretch sideways). */
  const maxWOverH = 2.05;

  const measure = (width: number): number => {
    card.style.width = `${width}px`;
    card.style.height = "auto";
    card.style.maxHeight = "none";
    return card.offsetHeight;
  };

  const fits = (width: number, height: number): boolean => {
    if (height > maxH + 0.5) return false;
    if (height / width > maxHOverW) return false;
    if (width / height > maxWOverH) return false;
    return true;
  };

  // Smallest width in [minW, maxW] that fits aspect + viewport height.
  let lo = minW;
  let hi = maxW;
  let bestW = maxW;
  let bestH = measure(maxW);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const height = measure(mid);
    if (fits(mid, height)) {
      bestW = mid;
      bestH = height;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  // If even maxW is too tall, keep maxW (height still auto — no scroll chrome).
  if (!fits(bestW, bestH)) {
    bestW = maxW;
    bestH = measure(bestW);
  } else {
    measure(bestW);
  }

  return { width: bestW, height: bestH };
}

function positionCard(
  spotlight: SpotlightRect | null,
  width: number,
  height: number,
): { top: number; left: number } {
  const margin = 16;

  if (!spotlight) {
    return {
      top: Math.max(margin, (window.innerHeight - height) / 2),
      left: Math.max(margin, (window.innerWidth - width) / 2),
    };
  }

  const belowTop = spotlight.top + spotlight.height + 12;
  const aboveTop = spotlight.top - height - 12;
  const preferBelow = belowTop + height + margin <= window.innerHeight;
  const top = preferBelow
    ? Math.min(belowTop, window.innerHeight - height - margin)
    : Math.max(margin, aboveTop > margin ? aboveTop : margin);

  let left = spotlight.left + spotlight.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

  return { top, left };
}

export function TutorialOverlay({
  open,
  onClose,
  onStepChange,
}: TutorialOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [cardLayout, setCardLayout] = useState<CardLayout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
  }, [open]);

  const step = STEPS[stepIndex] ?? STEPS[0];
  const isLast = stepIndex >= STEPS.length - 1;

  useEffect(() => {
    if (!open || !step) return;
    onStepChange?.({ id: step.id, index: stepIndex });
  }, [open, stepIndex, step, onStepChange]);

  useLayoutEffect(() => {
    if (!open) {
      setCardLayout(null);
      return;
    }

    const relayout = () => {
      const card = cardRef.current;
      if (!card) return;
      const nextSpotlight = readTargetRect(step?.target);
      setSpotlight((prev) => {
        if (
          prev &&
          nextSpotlight &&
          prev.top === nextSpotlight.top &&
          prev.left === nextSpotlight.left &&
          prev.width === nextSpotlight.width &&
          prev.height === nextSpotlight.height
        ) {
          return prev;
        }
        if (!prev && !nextSpotlight) return prev;
        return nextSpotlight;
      });
      const size = fitCardSize(card);
      const pos = positionCard(nextSpotlight, size.width, size.height);
      setCardLayout((prev) => {
        const next = { ...size, ...pos };
        if (
          prev &&
          Math.abs(prev.width - next.width) < 1 &&
          Math.abs(prev.height - next.height) < 1 &&
          Math.abs(prev.top - next.top) < 1 &&
          Math.abs(prev.left - next.left) < 1
        ) {
          return prev;
        }
        return next;
      });
    };

    relayout();
    window.addEventListener("resize", relayout);
    window.addEventListener("scroll", relayout, true);
    const timer = window.setInterval(relayout, 400);
    return () => {
      window.removeEventListener("resize", relayout);
      window.removeEventListener("scroll", relayout, true);
      window.clearInterval(timer);
    };
  }, [open, stepIndex, step?.target, step?.body]);

  useEffect(() => {
    if (!open) return;
    nextBtnRef.current?.focus();
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        if (isLast) onClose(true);
        else setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStepIndex((i) => Math.max(0, i - 1));
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, isLast, onClose]);

  if (!open || !step) return null;

  const cardStyle: CSSProperties = cardLayout
    ? {
        top: cardLayout.top,
        left: cardLayout.left,
        width: cardLayout.width,
        height: "auto",
        transform: "none",
        opacity: 1,
        visibility: "visible",
      }
    : {
        // Measure off-screen-ish first paint; layout effect replaces this.
        top: 0,
        left: 0,
        width: 360,
        height: "auto",
        transform: "none",
        opacity: 0,
        visibility: "hidden",
      };

  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      {/* Spotlight’s box-shadow is the dim when a target exists; otherwise a flat dim. */}
      {!spotlight && <div className="tutorial-dim" aria-hidden />}
      {spotlight && (
        <div
          className="tutorial-spotlight"
          aria-hidden
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}
      <div className="tutorial-card" ref={cardRef} style={cardStyle}>
        <p className="tutorial-progress">
          {stepIndex + 1} of {STEPS.length}
        </p>
        <h3 id="tutorial-title">{step.title}</h3>
        {renderBody(step.body)}
        <div className="tutorial-actions">
          <button
            type="button"
            className="tutorial-btn tutorial-btn-muted"
            onClick={() => onClose(true)}
          >
            Skip
          </button>
          <div className="tutorial-actions-end">
            <button
              type="button"
              className="tutorial-btn tutorial-btn-muted"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </button>
            <button
              type="button"
              className="tutorial-btn tutorial-btn-primary"
              ref={nextBtnRef}
              onClick={() => {
                if (isLast) onClose(true);
                else setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
              }}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
