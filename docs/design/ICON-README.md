# DroidDock Icon Design

## Current Icon Options

### Black & White Line Drawing Icons (NEW)

I've created 5 different black & white line drawing icon options. All are 512x512px SVG format with black background and white line drawings.

#### Option 1: Minimal Line Drawing
**File:** `icon-option-1-minimal.svg`  
**Style:** Simple, clean lines with minimal detail  
**Best for:** Modern, understated aesthetic  
**Features:**
- Phone with Android antennae
- Dock platform with connection line
- Folder icon with file lines
- Medium stroke width (6px)

#### Option 2: Bold Line Drawing
**File:** `icon-option-2-bold.svg`  
**Style:** Thicker, more prominent lines  
**Best for:** Better visibility at small sizes, strong presence  
**Features:**
- Bold phone outline (10px stroke)
- Screen content lines visible
- Transfer arrow showing file movement
- Stack of files icon
- **Most legible at small sizes (16x16, 32x32)**

#### Option 3: Geometric/Modern
**File:** `icon-option-3-geometric.svg`  
**Style:** Clean geometric shapes, precise rectangles  
**Best for:** Professional, modern aesthetic  
**Features:**
- Rectangular phone with notch detail
- Clean dock platform with base
- Connection indicator dots
- Geometric folder icon
- **Most "Apple-like" design**

#### Option 4: Playful Android Robot
**File:** `icon-option-4-playful.svg`  
**Style:** Cute Android mascot character  
**Best for:** Friendly, approachable feel  
**Features:**
- Full Android robot with body, arms, legs
- Expressive eyes
- Antennae clearly visible
- Floating documents
- **Most recognizable "Android" branding**

#### Option 5: Technical/Professional
**File:** `icon-option-5-technical.svg`  
**Style:** Blueprint/technical drawing aesthetic  
**Best for:** Professional developers, technical audience  
**Features:**
- Corner brackets (technical drawing style)
- USB port details visible
- Support feet on dock
- File system tree structure
- Cable with connector detail
- **Most detailed and technical**

### Recommendations

**Best Overall:** Option 2 (Bold) or Option 3 (Geometric)
- Option 2: Best legibility at all sizes
- Option 3: Most professional/modern look

**Strong Android branding:** Option 4 (Playful)
**For developers:** Option 5 (Technical)
**Most minimal:** Option 1 (Minimal)

### Viewing the Icons

```bash
open docs/design/icon-option-*.svg
```

---

## Original Gradient Icon

**File:** `icon-design.svg`  
**Style:** Colorful with gradients (Android green + macOS blue)

**Visual Elements:**
- 📱 Android Phone with green screen
- 🔌 Dock platform with connection indicators
- 📁 Orange folder icon
- 🎨 Blue-to-green gradient background

**Color Palette:**
- Android Green: `#3DDC84`
- macOS Blue: `#007AFF`
- Dark Slate: `#2C3E50`
- Orange: `#FFA500`
- White: `#ffffff`

---

## Converting SVG to Required Formats

### Using Inkscape (Command Line)

```bash
# Install Inkscape first
# macOS: brew install inkscape

# Generate PNG sizes
inkscape icon-design.svg --export-filename=../../src-tauri/icons/icon.png --export-width=512
inkscape icon-design.svg --export-filename=../../src-tauri/icons/128x128.png --export-width=128
inkscape icon-design.svg --export-filename=../../src-tauri/icons/128x128@2x.png --export-width=256
inkscape icon-design.svg --export-filename=../../src-tauri/icons/32x32.png --export-width=32
```

### Using ImageMagick + libicns

```bash
# Install tools
# macOS: brew install imagemagick libicns

# Convert to ICNS (macOS)
png2icns ../../src-tauri/icons/icon.icns icon-512.png icon-256.png icon-128.png icon-64.png icon-32.png

# Convert to ICO (Windows)
convert icon-design.svg -define icon:auto-resize=256,128,64,48,32,16 ../../src-tauri/icons/icon.ico
```

### Using Online Tools (Alternative)

If command-line tools aren't available:

1. **SVG to PNG**: [CloudConvert](https://cloudconvert.com/)
2. **PNG to ICNS**: [iConvert Icons](https://iconverticons.com/online/)
3. **PNG to ICO**: [ConvertICO](https://convertico.com/)

## Design Guidelines

- **Scalability**: Icon must be recognizable at 16x16 pixels
- **Contrast**: Should work on both light and dark backgrounds
- **Simplicity**: Avoid excessive detail for small sizes
- **Consistency**: Maintain style across all platforms
