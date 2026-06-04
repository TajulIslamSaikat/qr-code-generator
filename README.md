# ⬡ QR Code Generator

A pure JavaScript QR code generator with zero dependencies. Implements ISO/IEC 18004 fully — no libraries, no npm, just a browser.

**[🔗 Live Demo → tajulislamsaikat.github.io/qr-code-generator](https://tajulislamsaikat.github.io/qr-code-generator/)**

---

## Features

- **Zero dependencies** — QR encoding written from scratch in vanilla JS
- **Full ISO/IEC 18004** — versions 1–10, all 4 error correction levels (L/M/Q/H)
- **Custom colors** — foreground & background color pickers
- **Adjustable quiet zone** — 0, 1, 2, or 4 module margin
- **Export to SVG, PNG, JPG** — up to 1200×1200 px
- **Keyboard shortcut** — `Ctrl+Enter` to generate

---

## Project Structure

```
qr-code-generator/
├── index.html          # HTML markup
├── styles.css          # All styles & design tokens
└── js/
    ├── qr-encoder.js   # QR encoding engine (GF(256), Reed-Solomon, masking)
    └── app.js          # UI handlers & export functions
```

---

## Usage

No build step. Just open `index.html` in a browser.

```bash
# Clone and open
git clone <repo-url>
cd qr-code-generator
# Open index.html in your browser
```

Or serve locally:

```bash
npx serve .
# → http://localhost:3000
```

---

## How It Works

The encoder in `js/qr-encoder.js` implements the full QR spec:

| Step | Description |
|------|-------------|
| UTF-8 encode | Input text → byte array |
| Version selection | Smallest version that fits the data |
| Data codewords | Byte mode encoding with terminator & padding |
| Reed-Solomon EC | GF(256) polynomial division per block |
| Interleaving | Data + EC blocks interleaved per spec |
| Matrix placement | Finder, timing, alignment, format, version patterns |
| Mask evaluation | All 8 masks scored, lowest penalty selected |
| SVG output | Crisp `<rect>` elements, no canvas needed for preview |

---

## Error Correction Levels

| Level | Recovery Capacity | Best For |
|-------|-----------------|----------|
| **L** | ~7% | Clean print environments |
| **M** | ~15% | General use *(default)* |
| **Q** | ~25% | Slightly damaged codes |
| **H** | ~30% | Logos overlaid on QR |

---

## Export Formats

| Format | Notes |
|--------|-------|
| **SVG** | Vector, infinitely scalable, smallest file size |
| **PNG** | Lossless raster, best for sharing |
| **JPG** | Compressed raster, 95% quality |

---

## Browser Support

Works in all modern browsers. No polyfills required.

---

## License

MIT
