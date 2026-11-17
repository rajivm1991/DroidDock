import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AsIsAgreementText } from "./AsIsNotice";
import { isAsIsAccepted, setAsIsAccepted } from "../../lib/asIsAgreement";

/**
 * First-run setup for adb (Android Debug Bridge) in plain language: requirement
 * checklist, as-is agreement, automatic install with a live step log, debounced
 * path typing, one file-or-folder picker, and a short success animation before
 * the main app. The agreement is also collected by AsIsNotice before this
 * screen or the library. The checkbox here starts checked after that, and
 * unchecking it still blocks Install. Checking it stores the same acceptance.
 * Checklist labels distinguish Already installed and Install required (blocks phone
 * access). During install, “Please wait” stays fixed; only each step’s console
 * scrolls, traps wheel so the main page does not move, and auto-scrolls new lines.
 * Auto-install downloads Google’s platform-tools into DroidDock’s own folder, checks
 * the download, and stops on the first failure with the remaining manual steps. It
 * needs no password and no Homebrew.
 * USB debugging on the phone is still the user’s step elsewhere.
 */

interface SetupRequirement {
  id: string;
  title: string;
  detail: string;
  status: string;
}

interface AdbSetupProbe {
  locations_checked: string[];
  adb_ready: boolean;
  adb_path: string | null;
  requirements: SetupRequirement[];
}

interface SetupInstallEvent {
  step_id: string;
  step_title: string;
  status: string;
  detail: string;
  log_line: string | null;
}

interface StepRecord {
  step_id: string;
  step_title: string;
  status: string;
  detail: string;
  logs: string[];
}

interface AdbSetupScreenProps {
  triedPath: string;
  onReady: () => void;
}

const PLATFORM_TOOLS_URL =
  "https://developer.android.com/tools/releases/platform-tools";

/** Plain-language pill for each requirement row. */
function requirementStatusLabel(status: string): string {
  if (status === "ready") return "Already installed";
  return "Install required";
}

/** Badge for the checklist header — counts the items that block phone access. */
function checklistSummaryLabel(
  probe: AdbSetupProbe | null,
  installRequiredCount: number,
): string {
  if (!probe) return "Checking…";
  if (installRequiredCount === 0) return "All installed";
  if (installRequiredCount === 1) return "1 install required";
  return `${installRequiredCount} install required`;
}

/** While the pointer is over an install console, only that element scrolls — wheel does not bubble to the main setup page. Non-passive so preventDefault works in WebKit. */
function trapInstallOutputWheel(event: globalThis.WheelEvent) {
  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;
  event.stopPropagation();
  const { scrollTop, scrollHeight, clientHeight } = el;
  const canScroll = scrollHeight > clientHeight + 1;
  if (!canScroll) {
    event.preventDefault();
    return;
  }
  const atTop = scrollTop <= 0;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
  if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
    event.preventDefault();
  }
}

/** Fixed-height install console with wheel trapped to this element only. */
function InstallStepOutput({
  stepId,
  text,
  outputRefs,
}: {
  stepId: string;
  text: string;
  outputRefs: MutableRefObject<Map<string, HTMLPreElement>>;
}) {
  const localRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.addEventListener("wheel", trapInstallOutputWheel, { passive: false });
    return () => el.removeEventListener("wheel", trapInstallOutputWheel);
  }, []);

  return (
    <pre
      className="adb-step-output"
      ref={(node) => {
        localRef.current = node;
        if (node) outputRefs.current.set(stepId, node);
        else outputRefs.current.delete(stepId);
      }}
    >
      {text}
    </pre>
  );
}

export function AdbSetupScreen({ triedPath, onReady }: AdbSetupScreenProps) {
  const [probe, setProbe] = useState<AdbSetupProbe | null>(null);
  const [probeError, setProbeError] = useState("");
  const [agreed, setAgreed] = useState(() => isAsIsAccepted());
  const [installing, setInstalling] = useState(false);
  const [steps, setSteps] = useState<StepRecord[]>([]);
  const [installError, setInstallError] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [pathStatus, setPathStatus] = useState<"idle" | "checking" | "ok" | "bad">("idle");
  const [pathMessage, setPathMessage] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successLabel, setSuccessLabel] = useState("Phone tools ready");
  const debounceRef = useRef<number | null>(null);
  const skipPathDebounceRef = useRef(false);
  /** Per-step console elements — auto-scroll each one, never the page. */
  const stepOutputRefs = useRef<Map<string, HTMLPreElement>>(new Map());

  useEffect(() => {
    void refreshProbe();
  }, []);

  // Pin each step console to the bottom as new install lines arrive; the main page scroll stays put.
  useEffect(() => {
    for (const step of steps) {
      const el = stepOutputRefs.current.get(step.step_id);
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [steps]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<SetupInstallEvent>("setup-install-progress", (event) => {
      const payload = event.payload;
      setSteps((prev) => {
        const index = prev.findIndex((step) => step.step_id === payload.step_id);
        if (index < 0) {
          return [
            ...prev,
            {
              step_id: payload.step_id,
              step_title: payload.step_title,
              status: payload.status,
              detail: payload.detail,
              logs: payload.log_line ? [payload.log_line] : [],
            },
          ];
        }
        const next = [...prev];
        const current = next[index];
        next[index] = {
          ...current,
          status: payload.status,
          detail: payload.detail,
          logs: payload.log_line
            ? [...current.logs, payload.log_line].slice(-80)
            : current.logs,
        };
        return next;
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (skipPathDebounceRef.current) {
      skipPathDebounceRef.current = false;
      return;
    }
    const value = pathInput.trim();
    if (!value) {
      setPathStatus("idle");
      setPathMessage("");
      return;
    }
    setPathStatus("checking");
    setPathMessage("Checking…");
    debounceRef.current = window.setTimeout(() => {
      void applyPath(value, false);
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [pathInput]);

  async function refreshProbe() {
    try {
      setProbeError("");
      const result = await invoke<AdbSetupProbe>("probe_adb_setup");
      setProbe(result);
      if (result.adb_ready) {
        setSuccessLabel("Phone tools already found");
        setShowSuccess(true);
        window.setTimeout(() => onReady(), 1400);
      }
    } catch (err) {
      setProbeError(String(err));
    }
  }

  async function applyPath(value: string, fromPicker: boolean) {
    try {
      const resolved = await invoke<string>("validate_adb_path", { path: value });
      await invoke<string>("set_adb_path", { path: resolved });
      setPathStatus("ok");
      setPathMessage(fromPicker ? `Using ${resolved}` : `Found adb at ${resolved}`);
      setSuccessLabel("Phone tools ready");
      setShowSuccess(true);
      window.setTimeout(() => onReady(), 1400);
    } catch (err) {
      setPathStatus("bad");
      setPathMessage(String(err));
    }
  }

  /** One Choose control — file or folder — validated by the backend; applies immediately and skips the typing debounce. */
  async function pickAdb() {
    try {
      const selected = await invoke<string | null>("pick_adb_location");
      if (!selected) return;
      skipPathDebounceRef.current = true;
      setPathInput(selected);
      await applyPath(selected, true);
    } catch (err) {
      setPathStatus("bad");
      setPathMessage(String(err));
    }
  }

  async function startAutoInstall() {
    if (!agreed || installing) return;
    setInstalling(true);
    setInstallError("");
    setSteps([]);
    try {
      const resolved = await invoke<string>("install_adb_tools");
      setSuccessLabel(`Installed · ${resolved}`);
      setShowSuccess(true);
      window.setTimeout(() => onReady(), 1600);
    } catch (err) {
      setInstallError(String(err));
    } finally {
      setInstalling(false);
      void refreshProbe();
    }
  }

  const remainingManual = !probe
    ? []
    : [
        !probe.adb_ready && {
          title: "Install Android platform tools",
          body: "Use Install again once your internet connection is working. Or download the Mac zip from Google yourself (steps under “Download from Google instead”).",
        },
      ].filter(Boolean) as { title: string; body: string }[];

  // Header badge counts the adb blockers (missing platform-tools).
  const installRequiredCount =
    probe?.requirements.filter((r) => r.status === "missing").length ?? 0;

  if (showSuccess) {
    return (
      <div className="adb-setup-shell">
        <div className="adb-success" role="status" aria-live="polite">
          <div className="adb-success-ring">
            <div className="adb-success-check" />
          </div>
          <p className="adb-setup-brand-mark">DroidDock</p>
          <h1>{successLabel}</h1>
          <p>Opening your library…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="adb-setup-shell">
      <aside className="adb-setup-brand" aria-label="DroidDock">
        <div className="adb-setup-brand-inner">
          <p className="adb-setup-brand-mark">DroidDock</p>
          <h1>Your phone, on your Mac</h1>
          <p>
            Browse photos and files over USB — no cloud upload. This one-time
            setup installs the official Google helper that talks to your phone.
          </p>
          <ul className="adb-setup-brand-points">
            <li>Private — stays on the cable</li>
            <li>Same tool Android Studio uses</li>
            <li>Usually under five minutes</li>
          </ul>
        </div>
      </aside>

      <main className="adb-setup-main">
   
        <header className="adb-setup-card adb-setup-hero">
          <p className="adb-setup-kicker">Step 1 of setup</p>
          <h2>Connect your phone tools</h2>
          <p className="adb-setup-lead">
            DroidDock needs <strong>adb</strong> (Android Debug Bridge) on this Mac.
            We already looked in the usual places
            {triedPath ? (
              <>
                {" "}(last tried <code>{triedPath}</code>)
              </>
            ) : null}
            . Choose the path that fits you — most people use Install.
          </p>
        </header>

        <section className="adb-setup-card adb-setup-card-status" aria-labelledby="adb-checklist-title">
          <div className="adb-setup-card-head">
            <div>
              <p className="adb-setup-option-label">Checklist</p>
              <h3 id="adb-checklist-title">What we found on this Mac</h3>
            </div>
            <span
              className={`adb-setup-count${installRequiredCount > 0 ? " is-attention" : ""}`}
            >
              {checklistSummaryLabel(probe, installRequiredCount)}
            </span>
          </div>
          <p className="adb-setup-plain adb-setup-checklist-lead">
            A quick scan of helpers already on this Mac — not the install steps.{" "}
            <strong>Install required</strong> blocks phone access.
          </p>
          {probeError && <p className="adb-setup-error">{probeError}</p>}
          <ul className="adb-req-list">
            {(probe?.requirements ?? [
              { id: "platform-tools", title: "Android platform tools", detail: "Checking…", status: "missing" },
            ]).map((req) => (
              <li key={req.id} className={`adb-req is-${req.status}`}>
                <span className="adb-req-dot" aria-hidden />
                <div>
                  <div className="adb-req-title-row">
                    <span className="adb-req-title">{req.title}</span>
                    <span className="adb-req-status">{requirementStatusLabel(req.status)}</span>
                  </div>
                  <div className="adb-req-detail">{req.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          {installRequiredCount > 0 && (
            <p className="adb-setup-next-cue">
              Pick <strong>one</strong> option below to finish — Install for me,
              point at adb you already have, or download from Google. You do not
              need all three.
            </p>
          )}
        </section>

        <section className="adb-setup-card adb-setup-card-primary">
          <div className="adb-setup-card-head">
            <div>
              <p className="adb-setup-option-label">Recommended</p>
              <h3>Install for me</h3>
            </div>
          </div>
          <p className="adb-setup-plain">
            DroidDock downloads Google’s official Android platform tools (about 16 MB),
            checks that the file is exactly the one Google published, and keeps it in its
            own folder in your Library. It needs an internet connection, but no password
            and nothing else installed on your Mac. Nothing runs until you agree and start.
          </p>
          <label className="adb-agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setAsIsAccepted();
              }}
              disabled={installing}
            />
            <span>
              <AsIsAgreementText />
            </span>
          </label>
          <button
            type="button"
            className="adb-primary"
            disabled={!agreed || installing}
            onClick={() => void startAutoInstall()}
          >
            {installing ? "Installing…" : "Install missing tools"}
          </button>

          {(installing || steps.length > 0) && (
            <div className="adb-install-progress" aria-live="polite" aria-busy={installing}>
              {/* “Please wait” stays outside overflow regions so it remains visible while step consoles grow. */}
              {installing && (
                <div className="adb-install-wait" role="status">
                  <div className="adb-indeterminate" aria-hidden>
                    <span className="adb-indeterminate-bar" />
                  </div>
                  <p>
                    <strong>Please wait</strong> — still installing. The download can
                    take a minute on a slow connection. Do not quit.
                  </p>
                </div>
              )}
              <div className="adb-step-list">
                {steps.map((step) => (
                  <div key={step.step_id} className={`adb-step is-${step.status}`}>
                    <div className="adb-step-head">
                      <strong>{step.step_title}</strong>
                      <span className="adb-step-badge">{step.status}</span>
                    </div>
                    <p>{step.detail}</p>
                    {step.logs.length > 0 && (
                      <InstallStepOutput
                        stepId={step.step_id}
                        text={step.logs.join("\n")}
                        outputRefs={stepOutputRefs}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {installError && (
            <div className="adb-setup-fail">
              <h4>Stopped here</h4>
              <p>{installError}</p>
              <p>Finish only what is still missing:</p>
              <ol>
                {(remainingManual.length > 0
                  ? remainingManual
                  : [{
                      title: "Try again or use a path",
                      body: "Use Install again after fixing the error, or choose adb with the path controls below.",
                    }]
                ).map((item) => (
                  <li key={item.title}>
                    <strong>{item.title}</strong>
                    <div>{item.body}</div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <section className="adb-setup-card">
          <div className="adb-setup-card-head">
            <div>
              <p className="adb-setup-option-label">Already installed</p>
              <h3>Point DroidDock at adb</h3>
            </div>
          </div>
          <p className="adb-setup-plain">
            Paste the path to the <code>adb</code> program, or the folder that contains it
            (often <code>platform-tools</code>). We check as you type — or choose it so you
            never copy a path by hand. One picker accepts either a file or a folder.
          </p>
          <div className="adb-path-row">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="/opt/homebrew/bin/adb or …/platform-tools"
              aria-label="Path to adb or its folder"
              disabled={installing}
            />
            <button
              type="button"
              className="adb-secondary"
              onClick={() => void pickAdb()}
              disabled={installing}
            >
              Choose…
            </button>
          </div>
          {pathStatus !== "idle" && (
            <p className={`adb-path-msg is-${pathStatus}`}>{pathMessage}</p>
          )}
          <p className="adb-setup-hint">
            With Homebrew: <code>/opt/homebrew/bin/adb</code> (Apple silicon) or{" "}
            <code>/usr/local/bin/adb</code> (Intel). Hidden files follow Finder —
            press Cmd+Shift+. in the picker to toggle.
          </p>
        </section>

        <section className="adb-setup-card adb-setup-card-muted">
          <div className="adb-setup-card-head">
            <div>
              <p className="adb-setup-option-label">Manual</p>
              <h3>Download from Google instead</h3>
            </div>
          </div>
          <p className="adb-setup-plain">
            Use this if you would rather download it yourself. Only these steps are required.
          </p>
          <ol className="adb-manual-steps">
            <li>
              Open{" "}
              <a href={PLATFORM_TOOLS_URL} target="_blank" rel="noreferrer">
                Android Platform Tools for Mac
              </a>
              .
            </li>
            <li>Download the Mac zip (SDK Platform-Tools for macOS).</li>
            <li>
              Double-click the zip so it unpacks a <code>platform-tools</code> folder.
            </li>
            <li>Move that folder somewhere lasting, such as Applications or Documents.</li>
            <li>
              Click <strong>Choose…</strong> above and select that{" "}
              <code>platform-tools</code> folder, or the <code>adb</code> file inside it.
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}
