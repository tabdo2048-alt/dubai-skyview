import { Cartesian3, Matrix4, Transforms, type Cesium3DTileset } from "cesium";

export function detectProjectModelType(url: string) {
  return /(?:tileset\.json|\.3dtiles)(?:[?#]|$)/i.test(url) ? "3d-tiles" : "glb";
}

/** Stable source-local basis. Capture ONCE, before applying any placement metadata.
 * For ECEF sources the bounding-centre ENU frame becomes the placement anchor.
 */
export function tilesetPlacementBasis(tileset: Cesium3DTileset) {
  if (Cartesian3.magnitude(tileset.boundingSphere.center) <= 3_000_000)
    return Matrix4.clone(tileset.modelMatrix);
  return Matrix4.multiply(
    Matrix4.inverseTransformation(
      Transforms.eastNorthUpToFixedFrame(tileset.boundingSphere.center),
      new Matrix4(),
    ),
    tileset.modelMatrix,
    new Matrix4(),
  );
}
