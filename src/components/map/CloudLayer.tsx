type CloudLayerProps = {
  zoom: number;
};

/**
 * Drifting aerial cloud layer: four real cloud images pinned near the
 * viewport corners and animated horizontally via CSS keyframes. Fully
 * visible at zoom 10 and 10.5, fading through 11 and gone by zoom 11.5 so
 * clouds read at a cinematic altitude but clear out as you zoom into the city.
 */
export function CloudLayer({ zoom }: CloudLayerProps) {
  const opacity = zoom <= 11.2 ? 1 : Math.max(0, Math.min(1, (13 - zoom) / 1.8));

  return (
    <div className="map-clouds-wrapper" style={{ opacity }} aria-hidden="true">
      <div className="map-clouds-container">
        <div className="map-cloud map-cloud-top-left" />
        <div className="map-cloud map-cloud-top-right" />
        <div className="map-cloud map-cloud-bottom-left" />
        <div className="map-cloud map-cloud-bottom-right" />
      </div>
    </div>
  );
}
