/**
 * Full-name place-mark chips on one horizontal scroll row; the active chip scrolls
 * toward center. A pinned “+” saves the selected or open folder; custom presets
 * show an inline SVG × for remove (avoids a heavy font glyph on the chip).
 * Horizontal wheel stays on this strip; edge fades show when chips overflow.
 * The scrollbar sits in a fixed lane under the pills so labels stay readable.
 * Paths and validity come from the caller — this row does not invent or verify them.
 */

import { useEffect, useRef } from "react";
import { attachContainHorizontalWheel } from "../../lib/containHorizontalWheel";
import {
  horizontalScrollFadeClassName,
  useHorizontalScrollEdgeFades,
} from "../../hooks/ui/useHorizontalScrollEdgeFades";

export interface PlaceMarkItem {
  id: string;
  label: string;
  path: string;
  /** Custom presets can be removed from the row. */
  removable?: boolean;
}

interface PlaceMarksProps {
  places: PlaceMarkItem[];
  activePath: string;
  ariaLabel: string;
  onSelect: (path: string) => void;
  onAdd?: () => void;
  onRemove?: (path: string) => void;
  addDisabled?: boolean;
  addTooltip?: string;
  /** Spotlight target id for the one-time tutorial overlay. */
  tutorialTarget?: string;
  /** Spotlight target id for the + control. */
  addTutorialTarget?: string;
}

export function PlaceMarks({
  places,
  activePath,
  ariaLabel,
  onSelect,
  onAdd,
  onRemove,
  addDisabled,
  addTooltip = "Add selected or open folder",
  tutorialTarget,
  addTutorialTarget,
}: PlaceMarksProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const contentKey = places.map((place) => place.id).join("|");
  const edges = useHorizontalScrollEdgeFades(scrollerRef, contentKey);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    return attachContainHorizontalWheel(scroller);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const delta =
      activeRect.left +
      activeRect.width / 2 -
      (scrollerRect.left + scrollerRect.width / 2);
    scroller.scrollBy({ left: delta, behavior: "smooth" });
  }, [activePath, places]);

  return (
    <div
      className="place-marks"
      role="group"
      aria-label={ariaLabel}
      data-tutorial={tutorialTarget}
    >
      <div className={`${horizontalScrollFadeClassName(edges)} place-marks-fade`}>
        <div className="place-marks-scroll" ref={scrollerRef}>
          {places.map((place) => {
            const active = activePath === place.path;
            return (
              <span
                key={place.id}
                ref={active ? activeRef : undefined}
                className={`place-marks-chip-wrap ${active ? "is-active" : ""} ${
                  place.removable ? "is-custom" : ""
                }`}
              >
                <button
                  type="button"
                  className="place-marks-chip"
                  aria-label={place.label}
                  aria-pressed={active}
                  title={place.label}
                  onClick={() => onSelect(place.path)}
                >
                  {place.label}
                </button>
                {place.removable && onRemove ? (
                  <button
                    type="button"
                    className="place-marks-remove"
                    aria-label={`Remove ${place.label} preset`}
                    title="Remove preset"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(place.path);
                    }}
                  >
                    <svg
                      className="place-marks-remove-icon"
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      aria-hidden
                    >
                      <path
                        d="M2.2 2.2 L7.8 7.8 M7.8 2.2 L2.2 7.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                ) : null}
              </span>
            );
          })}
          <span className="place-marks-end-spacer" aria-hidden />
        </div>
      </div>
      {onAdd ? (
        <button
          type="button"
          className="phone-place-btn place-marks-add tooltip-bottom"
          data-tooltip={addTooltip}
          aria-label={addTooltip}
          data-tutorial={addTutorialTarget}
          disabled={addDisabled}
          onClick={onAdd}
        >
          +
        </button>
      ) : null}
    </div>
  );
}
