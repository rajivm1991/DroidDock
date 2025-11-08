# DroidDock Icon Design

## Design Concept

The DroidDock icon represents the core functionality: connecting Android devices to macOS for file browsing.

**Visual Elements:**
- 📱 **Android Phone**: White smartphone with green screen (Android's signature color #3DDC84)
- 🔌 **Dock Connection**: Dark platform representing Mac dock with connection indicators
- 📁 **Folder Icon**: Orange folder symbolizing file browsing capability
- 🎨 **Gradient Background**: Blue-to-green gradient representing Mac + Android integration

**Color Palette:**
- Android Green: `#3DDC84`
- macOS Blue: `#007AFF`
- Dark Slate: `#2C3E50` (phone outline, dock)
- Orange: `#FFA500` (folder)
- White: `#ffffff` (accents)

## Converting SVG to Required Formats

### Using Inkscape (Command Line)

```bash
# Install Inkscape first
# macOS: brew install inkscape
# Linux: sudo apt install inkscape

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
png2icns ../../src-tauri/icons/icon.icns icon-design-512.png icon-design-256.png icon-design-128.png icon-design-64.png icon-design-32.png

# Convert to ICO (Windows)
convert icon-design.svg -define icon:auto-resize=256,128,64,48,32,16 ../../src-tauri/icons/icon.ico
```

### Using Online Tools (Alternative)

If command-line tools aren't available:

1. **SVG to PNG**: Use [Inkscape Web](https://inkscape.org/) or [CloudConvert](https://cloudconvert.com/)
2. **PNG to ICNS**: Use [iConvert Icons](https://iconverticons.com/online/)
3. **PNG to ICO**: Use [ConvertICO](https://convertico.com/)

## Manual Process

1. Open `icon-design.svg` in a vector editor (Inkscape, Adobe Illustrator, Figma)
2. Export at 512x512px as `icon.png`
3. Export at required sizes (32x32, 128x128, 256x256)
4. Use platform-specific tools to create ICNS and ICO files
5. Replace files in `src-tauri/icons/`

## Design Guidelines

- **Scalability**: Icon must be recognizable at 16x16 pixels
- **Contrast**: Should work on both light and dark backgrounds
- **Simplicity**: Avoid excessive detail for small sizes
- **Brand Consistency**: Maintain colors across all marketing materials

## Future Enhancements

- Add animated icon for update notifications
- Create alternative monochrome version for menu bar
- Design promotional graphics using same style
- Create app store screenshots with consistent branding
