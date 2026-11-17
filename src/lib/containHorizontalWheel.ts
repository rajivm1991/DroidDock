/**
 * Horizontal trackpad or wheel overscroll on breadcrumbs and place marks used
 * to chain into the pane or the other strip and scroll the wrong surface. This
 * listener keeps horizontal delta on the hovered scroller (including at edges);
 * when the gesture also has vertical delta, it scrolls the nearest vertical
 * ancestor so the file list still moves. Pure vertical wheels are not captured
 * and bubble normally.
 */

export function attachContainHorizontalWheel(node: HTMLElement): () => void {
  const onWheel = (event: WheelEvent) => {
    const shiftHorizontal = event.shiftKey && event.deltaX === 0;
    const hDelta = shiftHorizontal ? event.deltaY : event.deltaX;
    const vDelta = shiftHorizontal ? 0 : event.deltaY;

    if (hDelta === 0) return;

    const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
    if (maxScroll > 0) {
      node.scrollLeft = Math.min(maxScroll, Math.max(0, node.scrollLeft + hDelta));
    }

    if (vDelta !== 0) {
      scrollNearestVerticalAncestor(node, vDelta);
    }

    event.preventDefault();
    event.stopPropagation();
  };

  node.addEventListener("wheel", onWheel, { passive: false });
  return () => node.removeEventListener("wheel", onWheel);
}

function scrollNearestVerticalAncestor(from: HTMLElement, deltaY: number): void {
  let parent: HTMLElement | null = from.parentElement;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    const canScrollY =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      parent.scrollHeight > parent.clientHeight + 1;
    if (canScrollY) {
      parent.scrollTop += deltaY;
      return;
    }
    parent = parent.parentElement;
  }
}
