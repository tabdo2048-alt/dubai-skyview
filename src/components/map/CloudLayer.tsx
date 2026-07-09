type CloudLayerProps = {
  zoom: number;
};

/**
 * Drifting aerial cloud layer: four real cloud images pinned near the
 * viewport corners and animated horizontally via CSS keyframes. Fully
 * visible on the opening wide view, then gone after the first zoom-in so
 * clouds clear out immediately as the user enters the city.
 */
export function CloudLayer({ zoom }: CloudLayerProps) {
  const opacity = zoom <= 10.45 ? 1 : Math.max(0, Math.min(1, (10.75 - zoom) / 0.3));

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
