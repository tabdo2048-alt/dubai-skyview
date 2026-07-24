type CloudLayerProps = {
  zoom: number;
};

/**
 * Drifting aerial cloud layer: four real cloud images pinned near the
 * viewport corners and animated horizontally via CSS keyframes. Fully
 * visible on the opening wide view, then gone after the first zoom-in so
 * clouds clear out immediately as the user enters the city.
 */
// The map now opens much further out (see setBoundsMinZoom in MapboxView), which
// sat the old curve at full strength on arrival and buried the city. Scale the
// whole curve instead of moving the 10.45/10.75 thresholds, so clouds still
// clear at exactly the same zoom — they are just lighter throughout.
const CLOUD_MAX_OPACITY = 0.55;

export function CloudLayer({ zoom }: CloudLayerProps) {
  const ramp = zoom <= 10.45 ? 1 : Math.max(0, Math.min(1, (10.75 - zoom) / 0.3));
  const opacity = ramp * CLOUD_MAX_OPACITY;

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
