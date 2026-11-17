/**
 * A long file list in a short panel hides rows above or below unless there is a
 * cue — the same pattern as horizontal edge fades on breadcrumbs. Returns
 * top/bottom flags from scroll position vs overflow; callers apply CSS classes.
 * Listens to scroll, resize, and child list changes; does not draw the fades.
 */

import { useEffect, useState, type RefObject } from "react";

export type VerticalScrollEdges = {
  canScrollUp: boolean;
  canScrollDown: boolean;
};

export function useVerticalScrollEdgeFades(
  scrollerRef: RefObject<HTMLElement | null>,
  /** Re-measure when the file list changes (scrollHeight may change without resize). */
  contentKey: string | number,
): VerticalScrollEdges {
  const [edges, setEdges] = useState<VerticalScrollEdges>({
    canScrollUp: false,
    canScrollDown: false,
  });

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const update = () => {
      const maxScroll = node.scrollHeight - node.clientHeight;
      const scrollTop = node.scrollTop;
      setEdges({
        canScrollUp: maxScroll > 1 && scrollTop > 1,
        canScrollDown: maxScroll > 1 && scrollTop < maxScroll - 1,
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

/** Class names for the shared vertical edge-fade shell. */
export function verticalScrollFadeClassName(edges: VerticalScrollEdges): string {
  const parts = ["v-scroll-fade"];
  if (edges.canScrollUp) parts.push("can-scroll-up");
  if (edges.canScrollDown) parts.push("can-scroll-down");
  return parts.join(" ");
}
