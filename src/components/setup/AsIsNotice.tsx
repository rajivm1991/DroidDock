/**
 * Phone-tool setup only appears when adb (Android Debug Bridge) is missing, and
 * its as-is checkbox only unlocks Install. A Mac that already has the tools
 * opens the library on first launch and never shows that line. This screen is
 * the same agreement, once, before setup or the library. Continuing stores the
 * choice. It does not install tools, open a folder, or start a transfer.
 * Declining leaves the person on this screen.
 */

import { useState } from "react";
import { setAsIsAccepted } from "../../lib/asIsAgreement";

interface AsIsNoticeProps {
  onAccept: () => void;
}

/** Shared wording with the install card so the two agreements cannot drift. */
export function AsIsAgreementText() {
  return (
    <>
      I understand this software and any install it runs are provided <strong>as is</strong>,
      without warranty. DroidDock’s authors are not responsible for damage to this Mac, my
      phone, my data, or anything else that may happen. I agree to continue.
    </>
  );
}

export function AsIsNotice({ onAccept }: AsIsNoticeProps) {
  const [checked, setChecked] = useState(false);

  function continueAfterAgree() {
    if (!checked) return;
    setAsIsAccepted();
    onAccept();
  }

  return (
    <div className="adb-setup-shell">
      <aside className="adb-setup-brand" aria-label="DroidDock">
        <div className="adb-setup-brand-inner">
          <p className="adb-setup-brand-mark">DroidDock</p>
          <h1>Before you continue</h1>
          <p>
            DroidDock browses and copies files between this Mac and your phone
            over a USB cable. This step comes first, whether phone tools are
            already on this Mac or still need to be installed.
          </p>
        </div>
      </aside>

      <main className="adb-setup-main">
        <section
          className="adb-setup-card adb-setup-card-primary"
          role="dialog"
          aria-modal="true"
          aria-labelledby="as-is-title"
        >
          <div className="adb-setup-card-head">
            <div>
              <p className="adb-setup-option-label">Agreement</p>
              <h3 id="as-is-title">Provided as is</h3>
            </div>
          </div>
          <p className="adb-setup-plain">
            DroidDock does not open your files until you agree. If phone tools
            still need to be installed, that screen shows this same line.
          </p>
          <label className="adb-agree">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>
              <AsIsAgreementText />
            </span>
          </label>
          <button
            type="button"
            className="adb-primary"
            disabled={!checked}
            onClick={continueAfterAgree}
          >
            Continue
          </button>
        </section>
      </main>
    </div>
  );
}
