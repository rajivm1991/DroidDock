/**
 * Sparse adb progress ticks used to make the bar pulse: each update either snapped
 * a catch-up target or parked the bar on a lead ceiling until the next tick.
 * Finder and Explorer keep motion continuous by integrating velocity that only
 * nudges when measurements arrive — display advances as velocity * dt each frame,
 * never snapping to a tick. Truth updates an EMA of throughput; desired velocity
 * combines that cruise with a slow pull when the bar lags measured bytes. Velocity
 * slews with an acceleration cap so corrections stay invisible; the bar soft-caps
 * below 100% until finished, then snaps to total. It avoids clamping to truth plus
 * a lead buffer (that reintroduces park-then-lunge) and CSS width transitions.
 */

import { useEffect, useRef, useState } from "react";

const SOFT_CAP = 0.997;
/** Max velocity change per second (vs file size), with a bytes/s² floor. */
const VEL_SLEW_FRAC = 0.55;
const VEL_SLEW_MIN = 128 * 1024;
/** Spread “behind truth” catch-up over this many seconds. */
const ERROR_CLOSE_SEC = 2.4;
/** Until the first real sample, crawl at this fraction of total / second. */
const INITIAL_CRUISE_FRAC = 0.035;

export function useSmoothedProgress(
  truthBytes: number,
  totalBytes: number,
  options: {
    active: boolean;
    paused: boolean;
    finished: boolean;
    /** Change when the logical transfer unit changes (job id / file id). */
    resetKey?: string;
  },
): number {
  const { active, paused, finished, resetKey = "" } = options;
  const [displayBytes, setDisplayBytes] = useState(truthBytes);
  const displayRef = useRef(truthBytes);
  const truthRef = useRef(truthBytes);
  const truthAtRef = useRef(performance.now());
  const measuredSpeedRef = useRef(0);
  const velocityRef = useRef(0);
  const desiredVelRef = useRef(0);
  const resetKeyRef = useRef(resetKey);

  const recomputeDesired = (display: number, truth: number, total: number) => {
    let cruise = measuredSpeedRef.current;
    if (cruise <= 1 && total > 0) {
      cruise = total * INITIAL_CRUISE_FRAC;
    }
    // Only correct when the bar lags measured bytes — never yank for being ahead.
    const behind = Math.max(0, truth - display);
    const correction = behind / ERROR_CLOSE_SEC;
    desiredVelRef.current = Math.max(0, cruise + correction * 0.4);
  };

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    const next = Math.max(0, truthBytes);
    truthRef.current = next;
    displayRef.current = next;
    measuredSpeedRef.current = 0;
    velocityRef.current = 0;
    desiredVelRef.current = 0;
    truthAtRef.current = performance.now();
    setDisplayBytes(next);
  }, [resetKey, truthBytes]);

  useEffect(() => {
    const prev = truthRef.current;
    const next = Math.max(0, truthBytes);
    if (next > prev) {
      const at = performance.now();
      const dt = (at - truthAtRef.current) / 1000;
      if (dt > 0.05) {
        const instant = (next - prev) / dt;
        if (Number.isFinite(instant) && instant > 0) {
          // Heavy EMA — one fat tick must not spike cruise speed.
          measuredSpeedRef.current =
            measuredSpeedRef.current > 0
              ? measuredSpeedRef.current * 0.82 + instant * 0.18
              : instant;
        }
      }
      truthAtRef.current = at;
      truthRef.current = next;
      recomputeDesired(displayRef.current, next, totalBytes);
    } else if (next < prev) {
      truthRef.current = next;
      displayRef.current = Math.min(displayRef.current, next);
      velocityRef.current = 0;
      desiredVelRef.current = 0;
      setDisplayBytes(displayRef.current);
    }
  }, [truthBytes, totalBytes]);

  useEffect(() => {
    if (finished) {
      const snap = totalBytes > 0 ? totalBytes : truthRef.current;
      displayRef.current = snap;
      velocityRef.current = 0;
      desiredVelRef.current = 0;
      setDisplayBytes(snap);
      return;
    }
    if (!active) return;

    if (velocityRef.current <= 0 && totalBytes > 0) {
      const seed = totalBytes * INITIAL_CRUISE_FRAC * 0.45;
      velocityRef.current = seed;
      desiredVelRef.current = Math.max(desiredVelRef.current, seed);
    }

    let frame = 0;
    let lastFrame = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;

      const truth = truthRef.current;
      const total = totalBytes;
      let display = displayRef.current;

      if (!paused) {
        recomputeDesired(display, truth, total);

        const desired = desiredVelRef.current;
        let velocity = velocityRef.current;
        const slewCap =
          Math.max(VEL_SLEW_MIN, total > 0 ? total * VEL_SLEW_FRAC : VEL_SLEW_MIN) *
          dt;
        const delta = desired - velocity;
        if (Math.abs(delta) <= slewCap) velocity = desired;
        else velocity += Math.sign(delta) * slewCap;
        velocityRef.current = Math.max(0, velocity);

        display += velocityRef.current * dt;
        if (total > 0) {
          display = Math.min(display, total * SOFT_CAP);
        }
      }

      display = Math.max(display, displayRef.current);
      if (total > 0) display = Math.min(display, total);

      displayRef.current = display;
      setDisplayBytes(display);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, paused, finished, totalBytes, resetKey]);

  return displayBytes;
}
