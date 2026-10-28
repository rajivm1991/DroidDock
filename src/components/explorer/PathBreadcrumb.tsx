/**
 * Shared Finder-style breadcrumb for phone and Mac: root plus segment buttons with
 * → separators on one horizontal scroll row. When the path changes, scrolls to
 * the end so the last crumb stays visible (end spacer avoids clipping at the
 * scrollbar). Horizontal wheel is contained on this strip; vertical scroll still
 * reaches the file list. Edge fades cue overflow left and right. Crumbs come from
 * the parent — this control does not wrap or invent segments.
 */

import { useEffect, useRef } from "react";
import { attachContainHorizontalWheel } from "../../lib/containHorizontalWheel";
import {
  horizontalScrollFadeClassName,
  useHorizontalScrollEdgeFades,
} from "../../hooks/ui/useHorizontalScrollEdgeFades";

export interface PathCrumb {
  label: string;
  /** Omit or leave undefined for non-clickable crumbs (e.g. current-only). */
  onClick?: () => void;
}

interface PathBreadcrumbProps {
  crumbs: PathCrumb[];
  onRoot?: () => void;
  rootLabel?: string;
  /** Accessible name — e.g. “Phone folder path” / “Mac folder path”. */
  ariaLabel: string;
}

export function PathBreadcrumb({
  crumbs,
  onRoot,
  rootLabel = "/",
  ariaLabel,
}: PathBreadcrumbProps) {
  const scrollerRef = useRef<HTMLElement>(null);
  const crumbKey = crumbs.map((c) => c.label).join("/");
  const edges = useHorizontalScrollEdgeFades(scrollerRef, crumbKey);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    return attachContainHorizontalWheel(scroller);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const id = window.requestAnimationFrame(() => {
      scroller.scrollTo({ left: scroller.scrollWidth, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [crumbKey, onRoot]);

  return (
    <div className={horizontalScrollFadeClassName(edges)}>
      <nav className="breadcrumb" aria-label={ariaLabel} ref={scrollerRef}>
        {onRoot ? (
          <span className="breadcrumb-segment">
            <button type="button" className="breadcrumb-btn" onClick={onRoot}>
              {rootLabel}
            </button>
          </span>
        ) : null}
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="breadcrumb-segment">
            <span className="separator" aria-hidden>
              →
            </span>
            <button
              type="button"
              className="breadcrumb-btn"
              onClick={crumb.onClick}
              disabled={!crumb.onClick}
            >
              {crumb.label}
            </button>
          </span>
        ))}
        <span className="breadcrumb-end-spacer" aria-hidden />
      </nav>
    </div>
  );
}
