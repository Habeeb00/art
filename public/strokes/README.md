# Scanned brush strokes (optional)

Drop your own scanned brush strokes here and list them in `manifest.json`:

```json
["stroke-01.png", "stroke-02.png"]
```

- PNG with a **transparent background**; the alpha is the paint coverage.
- Scan or photograph a real stroke horizontally (left to right), roughly 4:1.
- Keep the scan's light and dark: it's kept as texture while the colour is
  resampled from each painting.
- About 30% of strokes use a PNG when any are listed; the rest are drawn.
