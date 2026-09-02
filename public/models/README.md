# 3D Models (GLB)

Drop `.glb` files here to replace the low-poly placeholders used by the Mapbox
3D model system (`src/lib/mapbox/Model3DLayer.ts`).

Expected files (referenced by `src/lib/mapbox/modelRegistry.ts`):

- `yacht.glb` — Marina & Palm Jumeirah yachts
- `ship.glb` — Arabian Gulf cargo ship
- `abra.glb` — Dubai Creek abra
- `boat.glb` — Business Bay tourist boat
- `train.glb` — (optional) metro train model

If a file is missing, the layer logs
`Model file missing, using placeholder for: <MODEL_ID>` and renders a simple
procedural stand-in instead — the map never crashes.

## Adding your own model

1. Put the file here, e.g. `public/models/my-yacht.glb`.
2. Add a config in `src/lib/mapbox/modelRegistry.ts`:

   ```ts
   {
     id: "marina-yacht-02",
     name: "My Yacht",
     type: "yacht",
     modelUrl: "/models/my-yacht.glb",
     lng: 55.138, lat: 25.083, altitude: 0,
     scale: 1, rotation: [0, 0, 0],
     animate: true,
     route: [[55.138, 25.083], [55.145, 25.088], [55.151, 25.081]],
     speed: 0.03,
     visibleFromZoom: 11, visibleToZoom: 20,
   }
   ```

3. Models with a `route` move and rotate to face travel direction; without one
   they sit statically at `lng`/`lat`.

Tip: compress large GLBs with `gltf-transform` or Draco before shipping.
