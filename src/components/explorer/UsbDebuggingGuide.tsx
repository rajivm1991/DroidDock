/**
 * USB debugging steps on the empty phone pane. Brand and software dropdowns
 * pick a guide in as few clicks as possible: changing brand auto-selects that
 * brand’s newest software range, and the Software control hides when the brand
 * has only one range. Remembers the last choice. Plain brand names only.
 */
import { useState } from "react";
import {
  USB_DEBUGGING_BRANDS,
  findBrand,
  findSkin,
  loadUsbDebuggingSelection,
  saveUsbDebuggingSelection,
} from "../../lib/usbDebuggingGuides";

const DEFAULT_BRAND_ID = "pixel";
const DEFAULT_SKIN_ID = "android-12-17";

function newestSkinId(brandId: string): string {
  const brand = findBrand(brandId);
  return brand?.skins[brand.skins.length - 1]?.id ?? "";
}

function initialSelection(): { brandId: string; skinId: string } {
  const saved = loadUsbDebuggingSelection();
  if (saved) {
    const brand = findBrand(saved.brandId);
    if (brand && findSkin(brand, saved.skinId)) {
      return saved;
    }
    if (brand) {
      return { brandId: brand.id, skinId: newestSkinId(brand.id) };
    }
  }
  return { brandId: DEFAULT_BRAND_ID, skinId: DEFAULT_SKIN_ID };
}

export function UsbDebuggingGuide() {
  const [selection, setSelection] = useState(initialSelection);

  const brand = findBrand(selection.brandId);
  const skin = brand ? findSkin(brand, selection.skinId) : undefined;
  const showSoftware = (brand?.skins.length ?? 0) > 1;

  function setBrand(brandId: string) {
    const skinId = newestSkinId(brandId);
    const next = { brandId, skinId };
    setSelection(next);
    if (skinId) saveUsbDebuggingSelection(next);
  }

  function setSkin(skinId: string) {
    const next = { brandId: selection.brandId, skinId };
    setSelection(next);
    saveUsbDebuggingSelection(next);
  }

  return (
    <div className="usb-debug-guide">
      <p className="usb-debug-lede">
        Turn on USB debugging so this Mac can see the phone. Menu names differ
        by brand — pick yours
        {showSoftware ? ", then the software version on the phone" : ""}.
      </p>

      <div className="usb-debug-picker-block">
        <div
          className={`usb-debug-pickers${showSoftware ? "" : " is-brand-only"}`}
        >
          <label className="usb-debug-field">
            <span className="usb-debug-field-label">Brand</span>
            <select
              value={selection.brandId}
              onChange={(event) => setBrand(event.target.value)}
              aria-label="Phone brand"
            >
              {USB_DEBUGGING_BRANDS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          {showSoftware && (
            <label className="usb-debug-field">
              <span className="usb-debug-field-label">Software</span>
              <select
                value={selection.skinId}
                onChange={(event) => setSkin(event.target.value)}
                aria-label="Phone software version"
              >
                {(brand?.skins ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="usb-debug-disclaimer">
          Brand names identify Settings menus only. DroidDock is not affiliated
          with those brands.
        </p>
      </div>

      {brand && skin && (
        <div
          className={`usb-debug-steps${skin.unsupported ? " is-unsupported" : ""}`}
          role="region"
          aria-label={`${brand.name} ${skin.label} steps`}
        >
          <h3>
            {brand.name}
            <span className="usb-debug-steps-skin">{skin.label}</span>
          </h3>
          <ol>
            {skin.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {skin.notes && skin.notes.length > 0 && (
            <ul className="usb-debug-notes">
              {skin.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
