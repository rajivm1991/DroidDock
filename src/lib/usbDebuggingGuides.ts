/**
 * Brand and software-version steps for turning on USB debugging so DroidDock
 * can see the phone. Menu paths come from each vendor’s own support pages;
 * shared wording is reused only when those pages agree. Official logos are
 * omitted: a plain name is enough to identify the phone, and using the logo
 * would need permission the project does not have. HarmonyOS 5 and later talk
 * to Huawei’s hdc tool instead of Android Debug Bridge (adb), so those rows
 * explain the limit instead of listing adb steps.
 */

export type UsbDebuggingSkin = {
  id: string;
  label: string;
  /** Ordered Settings taps and switches for this skin. */
  steps: string[];
  /** Extra tips that sit under the steps (Auto Blocker, unlock while plugging in). */
  notes?: string[];
  /** When true, DroidDock cannot connect; steps explain why. */
  unsupported?: boolean;
  /** Vendor or docs URL for the next editor who needs to re-check the path. */
  source: string;
};

export type UsbDebuggingBrand = {
  id: string;
  name: string;
  skins: UsbDebuggingSkin[];
};

const SEARCH_FALLBACK =
  "If a label does not match, open Settings and search for Build number or Developer options.";

const STOCK_SOURCE = "https://developer.android.com/studio/debug/dev-options";
const XIAOMI_SOURCE = "https://www.mi.com/global/support/faq/details/KA-168765/";
const SAMSUNG_DEV =
  "https://www.samsung.com/us/support/answer/ANS10003430/";
const SAMSUNG_AUTO_BLOCKER =
  "https://www.samsung.com/us/support/answer/ANS10003636/";
const SAMSUNG_USB_LOCKED =
  "https://www.samsung.com/us/support/troubleshoot/TSG10013048/";
const NOTHING_SOURCE =
  "https://support.nothing.tech/hc/en-us/articles/33048353908241-How-do-I-enable-USB-debugging";
const MOTOROLA_SOURCE =
  "https://en-us.support.motorola.com/app/answers/detail/a_id/160067/~/developer-options";
const HUAWEI_SOURCE =
  "https://consumer.huawei.com/en/support/content/en-us00407281/";
const ASUS_SOURCE = "https://www.asus.com/support/faq/1046846/";

function stockSteps(): string[] {
  return [
    "Open Settings, then About phone.",
    "Tap Build number seven times. Enter your screen lock if asked.",
    "Go back to Settings, then System, then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function samsungBaseSteps(): string[] {
  return [
    "Open Settings, then About phone, then Software information.",
    "Tap Build number seven times. Enter your screen lock if asked.",
    "Go back to Settings. Developer options is at the bottom of the list.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function xiaomiMiuiSteps(): string[] {
  return [
    "Open Settings, then About phone, then Detailed info and specs.",
    "Tap MIUI version several times until the phone says you are a developer.",
    "Go back to Settings, then Additional settings, then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function xiaomiHyperOsSteps(): string[] {
  return [
    "Open Settings, then About phone (or About phone, then Detailed info and specs).",
    "Tap OS version several times until the phone says you are a developer. On some builds the line says HyperOS version or OS/MIUI version.",
    "Go back to Settings, then Additional settings, then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function colorOsSteps(): string[] {
  return [
    "Open Settings, then About device (or About phone), then Version.",
    "Tap Build number seven times. Enter your screen lock if asked.",
    "Go back to Settings, then Additional settings, then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function oxygenOsSteps(): string[] {
  return [
    "Open Settings, then About device (or About phone), then Version.",
    "Tap Build number (or Version number) seven times. Enter your screen lock if asked.",
    "Go back to Settings, then System settings (or System & update), then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function originOsSteps(): string[] {
  return [
    "Open Settings, then System management, then About phone (or My device, then More parameters).",
    "Tap Software version seven times. Enter your screen lock if asked.",
    "Go back to System management, then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function honorSteps(): string[] {
  return [
    "Open Settings, then About phone.",
    "Tap Build number seven times. Enter your screen lock if asked.",
    "Go back to Settings, then System & updates, then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function huaweiAdbSteps(): string[] {
  return [
    "Open Settings and search for Software version, or open About phone.",
    "Tap Build number seven times until the phone says you are a developer.",
    "Go to Settings, then System & updates, then Developer options.",
    "Turn on USB debugging.",
    "When you plug in the cable, choose Transfer files or Transfer photos.",
    SEARCH_FALLBACK,
  ];
}

function motorolaSteps(): string[] {
  return [
    "Open Settings, then About phone (or Settings, then System, then About phone).",
    "Tap Build number seven times. Enter your screen lock if asked.",
    "Go back to Settings, then System, then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function nothingSteps(): string[] {
  return [
    "Open Settings, then About phone, then Software info.",
    "Tap Build number seven times until the phone says you are in developer mode.",
    "Go to Settings, then System, then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function asusSteps(): string[] {
  return [
    "Open Settings, then About phone, then Software information (wording can vary).",
    "Tap Build number seven times.",
    "Open Developer options and turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function transsionSteps(): string[] {
  return [
    "Open Settings, then About phone or My phone.",
    "Tap Build number seven times. Enter your screen lock if asked.",
    "Go back to Settings, then System (or Advanced settings), then Developer options.",
    "Turn on USB debugging.",
    SEARCH_FALLBACK,
  ];
}

function skin(
  label: string,
  steps: string[],
  source: string,
  notes?: string[],
  unsupported?: boolean,
): UsbDebuggingSkin {
  return {
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    label,
    steps: [...steps],
    ...(notes ? { notes: [...notes] } : {}),
    ...(unsupported ? { unsupported: true } : {}),
    source,
  };
}

function harmonyUnsupported(label: string): UsbDebuggingSkin {
  return skin(
    label,
    [
      `${label} uses Huawei’s own USB debugging tool (hdc), not Android Debug Bridge (adb).`,
      "DroidDock talks to phones with adb, so this phone cannot connect here.",
      "Phones still on EMUI or HarmonyOS 2–4 can use that choice in this list.",
    ],
    "https://developer.huawei.com/consumer/en/doc/harmonyos-guides/hdc",
    undefined,
    true,
  );
}

/**
 * Major brands and software ranges from about October 2021 through the
 * October 2026 releases. Versions that share the same Settings path and notes
 * are one option (for example ColorOS 12–17), not a separate row per year.
 */
export const USB_DEBUGGING_BRANDS: UsbDebuggingBrand[] = [
  {
    id: "pixel",
    name: "Google Pixel / stock Android",
    skins: [skin("Android 12–17", stockSteps(), STOCK_SOURCE)],
  },
  {
    id: "samsung",
    name: "Samsung",
    skins: [
      skin("One UI 4–5.1", samsungBaseSteps(), SAMSUNG_DEV),
      skin(
        "One UI 6–6.1.1",
        samsungBaseSteps(),
        `${SAMSUNG_DEV} ; ${SAMSUNG_AUTO_BLOCKER}`,
        [
          "If USB debugging is greyed out, open Settings, then Security and privacy, then Auto Blocker, and turn Auto Blocker off. Samsung uses Auto Blocker to block USB commands.",
        ],
      ),
      skin(
        "One UI 7–8.5",
        samsungBaseSteps(),
        `${SAMSUNG_DEV} ; ${SAMSUNG_AUTO_BLOCKER} ; ${SAMSUNG_USB_LOCKED}`,
        [
          "If USB debugging is greyed out, open Settings, then Security and privacy, then Auto Blocker, and turn Auto Blocker off. It still blocks USB commands on One UI 7 and 8.",
          "Leave the phone unlocked while you plug in the cable. From One UI 7, USB data can stay blocked while the screen is locked.",
        ],
      ),
      skin(
        "One UI 9",
        samsungBaseSteps(),
        `${SAMSUNG_DEV} ; ${SAMSUNG_AUTO_BLOCKER} ; ${SAMSUNG_USB_LOCKED}`,
        [
          "If USB debugging is greyed out, open Settings, then Security and privacy, then Auto Blocker, and turn Auto Blocker off. It still blocks USB commands on One UI 9.",
          "If Maximum restrictions is on inside Auto Blocker, turn it off. On One UI 9 that mode can block the USB connection itself.",
          "Leave the phone unlocked while you plug in the cable.",
        ],
      ),
    ],
  },
  {
    id: "xiaomi",
    name: "Xiaomi / Redmi / POCO",
    skins: [
      skin("MIUI 13–14", xiaomiMiuiSteps(), XIAOMI_SOURCE),
      skin("HyperOS 1–4", xiaomiHyperOsSteps(), XIAOMI_SOURCE),
    ],
  },
  {
    id: "oppo",
    name: "OPPO",
    skins: [
      skin(
        "ColorOS 12–17",
        colorOsSteps(),
        "https://www.oppo.com/ (About device › Version › Build number; Additional settings › Developer options)",
      ),
    ],
  },
  {
    id: "realme",
    name: "realme",
    skins: [
      skin(
        "realme UI 3–7",
        colorOsSteps(),
        "https://www.realme.com/ (About device › Version › Build number; Additional settings › Developer options)",
      ),
      skin(
        "ColorOS 17",
        colorOsSteps(),
        "https://www.realme.com/ (ColorOS 17 shares the ColorOS Settings path)",
        [
          "Eligible realme phones move to ColorOS 17 with Android 17. Phones that have not updated yet stay on realme UI.",
        ],
      ),
    ],
  },
  {
    id: "oneplus",
    name: "OnePlus",
    skins: [
      skin("OxygenOS 12–16", oxygenOsSteps(), STOCK_SOURCE),
      skin(
        "ColorOS 17",
        colorOsSteps(),
        "https://www.oneplus.com/ (ColorOS 17; OxygenOS 12–16 use System settings › Developer options)",
        [
          "OnePlus does not ship OxygenOS 17. Eligible phones are offered ColorOS 17. A phone that has not updated is still on OxygenOS.",
        ],
      ),
    ],
  },
  {
    id: "vivo",
    name: "vivo / iQOO",
    skins: [
      skin(
        "OriginOS 1–7",
        originOsSteps(),
        "https://www.vivo.com.cn/ (System management › About phone › Software version)",
      ),
      skin(
        "Funtouch OS 12–15",
        originOsSteps(),
        "https://www.vivo.com.cn/ (Funtouch OS 9.2 and later share the System management path)",
      ),
    ],
  },
  {
    id: "honor",
    name: "Honor",
    skins: [
      skin(
        "Magic UI 6 / MagicOS 7–11",
        honorSteps(),
        "https://www.honor.com/ (About phone › Build number; System & updates › Developer options)",
      ),
    ],
  },
  {
    id: "huawei",
    name: "Huawei",
    skins: [
      skin("EMUI 12 / HarmonyOS 2–4", huaweiAdbSteps(), HUAWEI_SOURCE),
      harmonyUnsupported("HarmonyOS 5–7"),
    ],
  },
  {
    id: "motorola",
    name: "Motorola",
    skins: [
      skin(
        "My UX / Hello UI (Android 12–17)",
        motorolaSteps(),
        MOTOROLA_SOURCE,
      ),
    ],
  },
  {
    id: "nothing",
    name: "Nothing",
    skins: [
      skin("Nothing OS 2–5", nothingSteps(), NOTHING_SOURCE, [
        "Phone (1), Phone (2), and CMF Phone 1 stay on their older system and do not get Nothing OS 5.",
      ]),
    ],
  },
  {
    id: "sony",
    name: "Sony Xperia",
    skins: [skin("Android 12–17", stockSteps(), STOCK_SOURCE)],
  },
  {
    id: "asus",
    name: "ASUS",
    skins: [skin("Zenfone / ROG", asusSteps(), ASUS_SOURCE)],
  },
  {
    id: "tecno",
    name: "Tecno",
    skins: [
      skin(
        "HiOS",
        transsionSteps(),
        "Tecno Settings › About phone / My phone › Build number",
      ),
    ],
  },
  {
    id: "infinix",
    name: "Infinix",
    skins: [
      skin(
        "XOS",
        transsionSteps(),
        "Infinix Settings › About phone / My phone › Build number",
      ),
    ],
  },
  {
    id: "itel",
    name: "itel",
    skins: [
      skin(
        "itel Android",
        transsionSteps(),
        "itel Settings › About phone / My phone › Build number",
      ),
    ],
  },
  {
    id: "nokia",
    name: "Nokia / HMD",
    skins: [skin("Android 12–17", stockSteps(), STOCK_SOURCE)],
  },
  {
    id: "fairphone",
    name: "Fairphone",
    skins: [skin("Android 12–17", stockSteps(), STOCK_SOURCE)],
  },
  {
    id: "lenovo",
    name: "Lenovo",
    skins: [skin("Android / ZUI", stockSteps(), STOCK_SOURCE)],
  },
  {
    id: "zte",
    name: "ZTE",
    skins: [skin("MyOS / Android", stockSteps(), STOCK_SOURCE)],
  },
  {
    id: "nubia",
    name: "Nubia",
    skins: [skin("MyOS / Android", stockSteps(), STOCK_SOURCE)],
  },
  {
    id: "meizu",
    name: "Meizu",
    skins: [
      skin(
        "Flyme",
        [
          "Open Settings, then About phone, then Version information.",
          "Tap the build number line seven times.",
          "Go back to Settings, then Additional settings, then Developer options.",
          "Turn on USB debugging.",
          SEARCH_FALLBACK,
        ],
        "Meizu Flyme About phone › Version information",
      ),
    ],
  },
  {
    id: "tcl",
    name: "TCL",
    skins: [skin("Android", stockSteps(), STOCK_SOURCE)],
  },
  {
    id: "lg",
    name: "LG",
    skins: [
      skin(
        "LG UX (legacy)",
        [
          "Open Settings, then About phone, then Software info.",
          "Tap Build number seven times.",
          "Open Developer options and turn on USB debugging.",
          SEARCH_FALLBACK,
        ],
        STOCK_SOURCE,
      ),
    ],
  },
];

export const USB_DEBUGGING_STORAGE_KEY = "droiddock-usb-debug-guide";

export type UsbDebuggingSelection = {
  brandId: string;
  skinId: string;
};

export function loadUsbDebuggingSelection(): UsbDebuggingSelection | null {
  try {
    const raw = localStorage.getItem(USB_DEBUGGING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UsbDebuggingSelection;
    if (
      typeof parsed?.brandId === "string" &&
      typeof parsed?.skinId === "string"
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveUsbDebuggingSelection(selection: UsbDebuggingSelection): void {
  try {
    localStorage.setItem(USB_DEBUGGING_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    /* ignore quota / private mode */
  }
}

export function findBrand(brandId: string): UsbDebuggingBrand | undefined {
  return USB_DEBUGGING_BRANDS.find((brand) => brand.id === brandId);
}

export function findSkin(
  brand: UsbDebuggingBrand,
  skinId: string,
): UsbDebuggingSkin | undefined {
  return brand.skins.find((skin) => skin.id === skinId);
}
