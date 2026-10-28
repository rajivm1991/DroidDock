/**
 * Icons zoom steps for Phone and This Mac.
 *
 * Small through xlarge is the glyph ladder and stays the ceiling while Show
 * Thumbnails is off. Photo steps exist so a preview can be large enough to
 * see. Previews are generated at THUMBNAIL_SOURCE_PX (same edge as
 * THUMBNAIL_EDGE in the thumbnail command). A step is not offered when it
 * would upscale that bitmap on this display, or when two tiles would no
 * longer fit the narrower pane. The first photo step is still offered
 * whenever the bitmap can cover it, so thumbnails can always zoom past the
 * glyph ceiling on a normal window. The thumbnail step is remembered separately
 * from the plain-glyph step, and Show Thumbnails is remembered with them.
 */
import {
  useCallback,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type SetStateAction,
} from "react";

/** Longest edge of a generated preview. Keep in sync with THUMBNAIL_EDGE. */
export const THUMBNAIL_SOURCE_PX = 512;

export const ICON_SIZE_ORDER = [
  "small",
  "medium",
  "large",
  "xlarge",
  "photo",
  "photo2",
  "photo3",
  "photo4",
] as const;

export type IconSize = (typeof ICON_SIZE_ORDER)[number];

/** Largest Icons step while thumbnails are off. */
export const GLYPH_MAX_ICON_SIZE: IconSize = "xlarge";

type IconStep = {
  id: IconSize;
  /** Square preview / glyph box, CSS pixels. */
  icon: number;
  /** Minimum column width. Wider than the icon so the name has room. */
  tile: number;
  gap: number;
  name: number;
  lines: number;
};

/**
 * Pixel sizes for the four glyph steps match the previous Icons zoom.
 * Photo steps are only selected while thumbnails are on.
 */
const ICON_STEPS: readonly IconStep[] = [
  { id: "small", icon: 40, tile: 72, gap: 6, name: 10, lines: 1 },
  { id: "medium", icon: 56, tile: 96, gap: 8, name: 12, lines: 2 },
  { id: "large", icon: 72, tile: 120, gap: 10, name: 13, lines: 3 },
  { id: "xlarge", icon: 88, tile: 140, gap: 12, name: 14, lines: 3 },
  { id: "photo", icon: 128, tile: 156, gap: 12, name: 13, lines: 2 },
  { id: "photo2", icon: 168, tile: 196, gap: 12, name: 13, lines: 2 },
  { id: "photo3", icon: 208, tile: 232, gap: 12, name: 14, lines: 2 },
  { id: "photo4", icon: 256, tile: 288, gap: 16, name: 14, lines: 2 },
];

export type IconPaneMetrics = {
  /** Tile space in the narrower pane, after grid padding and a scrollbar gutter. */
  contentWidth: number;
  /** Visible Icons area height, not the scrolled content. */
  listHeight: number;
  dpr: number;
};

const SCROLLBAR_GUTTER = 16;
const GRID_PAD = 20;
/** Icon box plus the two-line name and the tile padding. */
const ROW_CHROME = 64;

const STEP_BY_ID = Object.fromEntries(ICON_STEPS.map((step) => [step.id, step])) as Record<
  IconSize,
  IconStep
>;

function iconStep(size: IconSize): IconStep {
  return STEP_BY_ID[size];
}

export function iconSizeIndex(size: IconSize): number {
  return ICON_SIZE_ORDER.indexOf(size);
}

export function clampIconSize(size: IconSize, max: IconSize): IconSize {
  return iconSizeIndex(size) > iconSizeIndex(max) ? max : size;
}

export function nextIconSize(size: IconSize, max: IconSize): IconSize {
  const index = iconSizeIndex(size);
  const cap = iconSizeIndex(max);
  if (index >= cap) return size;
  return ICON_SIZE_ORDER[index + 1] ?? size;
}

export function prevIconSize(size: IconSize): IconSize {
  const index = iconSizeIndex(size);
  if (index <= 0) return size;
  return ICON_SIZE_ORDER[index - 1] ?? size;
}

export function canZoomInIcon(size: IconSize, max: IconSize): boolean {
  return nextIconSize(size, max) !== size;
}

export function canZoomOutIcon(size: IconSize): boolean {
  return prevIconSize(size) !== size;
}

const THUMBNAILS_ENABLED_KEY = "droiddock-thumbnails";
export const PHONE_THUMB_ICON_KEY = "droiddock-phone-icon-size";
export const PHONE_GLYPH_ICON_KEY = "droiddock-phone-glyph-icon-size";
export const MAC_THUMB_ICON_KEY = "droiddock-mac-icon-size";
export const MAC_GLYPH_ICON_KEY = "droiddock-mac-glyph-icon-size";

function isIconSize(value: string | null): value is IconSize {
  return value !== null && (ICON_SIZE_ORDER as readonly string[]).includes(value);
}

/** Last Show Thumbnails choice. Off when nothing has been saved yet. */
export function loadThumbnailsEnabled(): boolean {
  try {
    return localStorage.getItem(THUMBNAILS_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveThumbnailsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(THUMBNAILS_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode / quota — the in-memory toggle still works this session */
  }
}

function loadStoredIconSize(key: string, fallback: IconSize): IconSize {
  try {
    const saved = localStorage.getItem(key);
    if (isIconSize(saved)) return saved;
  } catch {
    /* ignore */
  }
  return fallback;
}

function saveStoredIconSize(key: string, size: IconSize): void {
  try {
    localStorage.setItem(key, size);
  } catch {
    /* ignore */
  }
}

/**
 * Icons size for one pane. The thumbnail size and the plain-glyph size are
 * kept apart: turning previews off shows the glyph ceiling, and turning them
 * on again puts the thumbnail size back. Neither slot is rewritten when the
 * window is only too small to draw the saved step.
 */
export function usePaneIconSize(
  thumbKey: string,
  glyphKey: string,
  thumbnailsEnabled: boolean,
  iconSizeMax: IconSize,
): {
  iconSize: IconSize;
  setIconSize: (value: SetStateAction<IconSize>) => void;
} {
  const [thumbSize, setThumbSize] = useState<IconSize>(() => loadStoredIconSize(thumbKey, "medium"));
  const [glyphSize, setGlyphSize] = useState<IconSize>(() =>
    clampIconSize(loadStoredIconSize(glyphKey, "medium"), GLYPH_MAX_ICON_SIZE),
  );
  const [enabledSnapshot, setEnabledSnapshot] = useState(thumbnailsEnabled);
  if (thumbnailsEnabled !== enabledSnapshot) {
    setEnabledSnapshot(thumbnailsEnabled);
    if (!thumbnailsEnabled) {
      setGlyphSize(clampIconSize(thumbSize, GLYPH_MAX_ICON_SIZE));
    }
  }

  useLayoutEffect(() => {
    saveStoredIconSize(thumbKey, thumbSize);
  }, [thumbKey, thumbSize]);

  useLayoutEffect(() => {
    saveStoredIconSize(glyphKey, glyphSize);
  }, [glyphKey, glyphSize]);

  const setIconSize = useCallback(
    (value: SetStateAction<IconSize>) => {
      if (thumbnailsEnabled) {
        setThumbSize(value);
        return;
      }
      setGlyphSize((size) =>
        clampIconSize(typeof value === "function" ? value(size) : value, GLYPH_MAX_ICON_SIZE),
      );
    },
    [thumbnailsEnabled],
  );

  return {
    iconSize: clampIconSize(thumbnailsEnabled ? thumbSize : glyphSize, iconSizeMax),
    setIconSize,
  };
}

/**
 * CSS variables consumed by `.grid-view`. Phone and This Mac both use this so
 * a step cannot drift between the stylesheet and the zoom ceiling.
 */
export function iconGridStyle(size: IconSize): CSSProperties {
  const step = iconStep(size);
  return {
    ["--grid-tile" as string]: `${step.tile}px`,
    ["--grid-gap" as string]: `${step.gap}px`,
    ["--grid-icon" as string]: `${step.icon}px`,
    ["--grid-name" as string]: `${step.name}px`,
    ["--grid-lines" as string]: String(step.lines),
  };
}

function iconStepFits(step: IconStep, metrics: IconPaneMetrics): boolean {
  const twoColumns = step.tile * 2 + step.gap;
  if (twoColumns > metrics.contentWidth) return false;
  if (step.icon + ROW_CHROME > metrics.listHeight) return false;
  return true;
}

/**
 * Largest step the +/- buttons may reach. Thumbnails off stops at xlarge.
 * Thumbnails on walks the photo steps that stay sharp and still show two
 * columns, and always keeps the first photo step when the bitmap covers it.
 */
export function maxIconSizeFor(
  thumbnailsEnabled: boolean,
  metrics: IconPaneMetrics,
): IconSize {
  if (!thumbnailsEnabled) return GLYPH_MAX_ICON_SIZE;
  const dpr = Number.isFinite(metrics.dpr) && metrics.dpr > 0 ? metrics.dpr : 1;
  const sharp = Math.floor(THUMBNAIL_SOURCE_PX / dpr);
  let best: IconSize = GLYPH_MAX_ICON_SIZE;
  for (const step of ICON_STEPS) {
    if (iconSizeIndex(step.id) <= iconSizeIndex(GLYPH_MAX_ICON_SIZE)) continue;
    if (step.icon > sharp) break;
    const firstPhotoStep = best === GLYPH_MAX_ICON_SIZE;
    if (!firstPhotoStep && !iconStepFits(step, metrics)) break;
    best = step.id;
  }
  return best;
}

export function estimateIconPaneMetrics(): IconPaneMetrics {
  const width = typeof window === "undefined" ? 1100 : window.innerWidth;
  const height = typeof window === "undefined" ? 780 : window.innerHeight;
  const dpr = typeof window === "undefined" ? 2 : window.devicePixelRatio || 1;
  // Half the window, then Mac's list inset, the grid padding, and a gutter
  // so a scrollbar cannot flip the ceiling on and off.
  return {
    contentWidth: Math.max(160, Math.floor(width / 2) - 16 - GRID_PAD - SCROLLBAR_GUTTER),
    listHeight: Math.max(120, height - 230),
    dpr,
  };
}

function measureIconPaneMetrics(): IconPaneMetrics | null {
  const phone = document.querySelector(".phone-pane");
  const mac = document.querySelector(".mac-pane");
  if (!(phone instanceof HTMLElement) && !(mac instanceof HTMLElement)) return null;

  const contentWidthOf = (pane: HTMLElement, macInset: number) => {
    const grid = pane.querySelector(".grid-view");
    if (grid instanceof HTMLElement && grid.clientWidth > 0) {
      const style = getComputedStyle(grid);
      const pad =
        (Number.parseFloat(style.paddingLeft) || 0) +
        (Number.parseFloat(style.paddingRight) || 0);
      return Math.floor(grid.clientWidth - pad - SCROLLBAR_GUTTER);
    }
    return Math.floor(pane.clientWidth - macInset - GRID_PAD - SCROLLBAR_GUTTER);
  };

  const listHeightOf = (pane: HTMLElement) => {
    const grid = pane.querySelector(".grid-view");
    if (grid instanceof HTMLElement && grid.clientHeight > 80) {
      return Math.floor(grid.clientHeight);
    }
    const chrome = pane.querySelector(":scope > .pane-chrome");
    const chromeH = chrome instanceof HTMLElement ? chrome.offsetHeight : 0;
    return Math.floor(Math.max(80, pane.clientHeight - chromeH));
  };

  const widths: number[] = [];
  const heights: number[] = [];
  if (phone instanceof HTMLElement) {
    widths.push(contentWidthOf(phone, 0));
    heights.push(listHeightOf(phone));
  }
  if (mac instanceof HTMLElement) {
    widths.push(contentWidthOf(mac, 16));
    heights.push(listHeightOf(mac));
  }
  const contentWidth = Math.min(...widths);
  const listHeight = Math.min(...heights);
  if (!Number.isFinite(contentWidth) || contentWidth < 80) return null;
  return {
    contentWidth,
    listHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

function sameMetrics(a: IconPaneMetrics, b: IconPaneMetrics): boolean {
  return a.contentWidth === b.contentWidth && a.listHeight === b.listHeight && a.dpr === b.dpr;
}

/**
 * Ceiling for both panes. Measures the live panes once they are on screen,
 * and again when the window or display scale changes. Does not zoom the
 * current size up by itself — callers clamp downward when this shrinks.
 */
export function useIconSizeLimit(thumbnailsEnabled: boolean, panesMounted: boolean): IconSize {
  const [metrics, setMetrics] = useState<IconPaneMetrics>(estimateIconPaneMetrics);

  useLayoutEffect(() => {
    if (!panesMounted) return;
    const read = () => {
      const next = measureIconPaneMetrics() ?? estimateIconPaneMetrics();
      setMetrics((prev) => (sameMetrics(prev, next) ? prev : next));
    };
    read();
    const observer = new ResizeObserver(read);
    const panes = document.querySelectorAll(".phone-pane, .mac-pane");
    panes.forEach((node) => observer.observe(node));
    document.querySelectorAll(".pane-chrome").forEach((node) => observer.observe(node));
    // Icons mounts the grid as a direct child. Watch that swap only — not
    // every file row — so the ceiling updates when the view changes.
    const mutations = new MutationObserver(read);
    panes.forEach((node) => mutations.observe(node, { childList: true }));
    window.addEventListener("resize", read);
    let media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onScale = () => {
      read();
      media.removeEventListener("change", onScale);
      media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      media.addEventListener("change", onScale);
    };
    media.addEventListener("change", onScale);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", read);
      media.removeEventListener("change", onScale);
    };
  }, [panesMounted]);

  return maxIconSizeFor(thumbnailsEnabled, metrics);
}
