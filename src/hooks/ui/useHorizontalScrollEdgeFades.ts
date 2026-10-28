/**
 * Breadcrumbs and place marks can scroll horizontally without it being obvious that
 * more content sits off-screen. This hook sets left/right edge flags when the
 * scroller is not flush with the ends; callers attach CSS classes — it does not
 * draw the fades. It re-measures on scroll, resize, and when child content changes
 * (pass a contentKey when scrollWidth may change without a resize).
 */

import { useEffect, useState, type RefObject } from "react";

export type HorizontalScrollEdges = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

export function useHorizontalScrollEdgeFades(
  scrollerRef: RefObject<HTMLElement | null>,
  /** Re-measure when path/chips change (scrollWidth may change without resize). */
  contentKey: string | number,
): HorizontalScrollEdges {
  const [edges, setEdges] = useState<HorizontalScrollEdges>({
    canScrollLeft: false,
    canScrollRight: false,
  });

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const update = () => {
      const maxScroll = node.scrollWidth - node.clientWidth;
      const scrollLeft = node.scrollLeft;
      setEdges({
        canScrollLeft: maxScroll > 1 && scrollLeft > 1,
        canScrollRight: maxScroll > 1 && scrollLeft < maxScroll - 1,
      });
    };

    update();
    const raf = window.requestAnimationFrame(update);
    node.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(node);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      window.cancelAnimationFrame(raf);
      node.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [scrollerRef, contentKey]);

  return edges;
}

/** Class names for the shared edge-fade shell. */
export function horizontalScrollFadeClassName(edges: HorizontalScrollEdges): string {
  const parts = ["h-scroll-fade"];
  if (edges.canScrollLeft) parts.push("can-scroll-left");
  if (edges.canScrollRight) parts.push("can-scroll-right");
  return parts.join(" ");
}
