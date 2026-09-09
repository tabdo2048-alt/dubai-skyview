# Client 3D model preparation

Use GLB for an individual project/building and 3D Tiles for a large masterplan or development district.

Recommended GLB preparation:

- model in metres with a sensible origin near the site's ground anchor;
- Y-up glTF convention;
- Draco or Meshopt geometry compression after visual verification;
- KTX2/Basis textures where compatible;
- textures sized for their actual screen use (usually 1K–2K, selectively 4K);
- remove duplicate materials and unseen geometry;
- preserve PBR base color, metallic/roughness, normal, emissive and alpha settings;
- descriptive object names (`Tower_A`, `Retail`, `Pool`) instead of generated cube names.

The admin placement editor changes only transform metadata. It never rewrites the GLB.

For reliable per-tower click/data mapping, publish 3D Tiles with feature IDs/properties such as `feature_key` and `feature_name`. A monolithic GLB can still be selected as a project, but Cesium cannot guarantee arbitrary node-level picking unless the asset contains supported feature metadata.

