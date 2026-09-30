# Scanned brush strokes (optional)

Every painting is built from eleven brush marks, drawn in code:

`flat` `round` `filbert` `dry` `knife` `scumble` `dab` `fan` `rigger` `sweep` `stipple`

Any of them can be replaced by your own scanned strokes. Drop PNGs here and map
them in `manifest.json`:

```json
{
  "flat": ["flat-1.png", "flat-2.png"],
  "fan": "fan.png",
  "knife": ["knife.png"]
}
```

(A plain list, `["a.png", "b.png"]`, is used for `flat`.)

- PNG with a **transparent background**; the alpha is the paint coverage.
- Scan or photograph the stroke horizontally (left to right), roughly 4:1.
- The scan's own light and dark is kept as texture; the colour is resampled
  from each painting.
- When a type has scans, they're used for about 70% of that type's strokes.
