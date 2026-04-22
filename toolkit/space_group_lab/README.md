# Space Group Lab

This folder is the starting workspace for the crystallographic space-group project.

## Goals

- Upgrade from point-group operations to affine Seitz operations: {R|t}
- Add translational symmetry operations:
  - screw axes
  - glide planes
- Support standard crystallographic graphical symbols
- Build validation cases against reference tables

## Suggested Structure

- core/: algebra and Seitz operation engine
- data/: space-group definitions and generators
- symbols/: standard symbol rendering helpers
- views/: 2D/3D visualization layer
- tests/: reference validation cases

## Next Step

Initialize a minimal affine-operation engine and one or two space-group examples.

## Phase 1 Implemented

- `core/seitz.js`
  - Seitz operation parsing: xyz triplets -> `{R|t}`
  - Operation composition, closure generation, orbit computation
  - Fractional wrapping and operation/point keys for deduplication
- `data/space_groups_min.json`
  - Minimal reference set: `P1`, `P-1`, `P21/c`
- `data/space_groups_min.js`
  - Browser-ready global dataset: `window.SpaceGroupDataMin`

The current page now loads the Seitz core and minimal dataset and shows a live prototype summary for `P21/c` in the stats panel.

## Current Symbol Engine API

`graphical_symbols.js` exposes `window.PointGroupGraphicalSymbols`:

- `drawAxisSymbol(ctx, options)`
- `drawInversionCenter(ctx, options)`
- `drawMirrorGreatCircle(ctx, options)`
- `drawPrimitiveCircle(ctx, options)`
- `drawGuideAxes(ctx, options)`
