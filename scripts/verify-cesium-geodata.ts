import assert from "node:assert/strict";
import { pointInPolygon } from "../src/components/map/cesium/CesiumProjectClipping";
import { processBuildings } from "./geodata/process-buildings";
import { processParks } from "./geodata/process-parks";
import { processRoads } from "./geodata/process-roads";
import type { FeatureCollection } from "./geodata/lib";

const polygon = [[[55.25, 25.18], [55.27, 25.18], [55.27, 25.2], [55.25, 25.2], [55.25, 25.18]]];
assert.equal(pointInPolygon(55.26, 25.19, polygon), true);
assert.equal(pointInPolygon(55.3, 25.19, polygon), false);

const source: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "building-levels",
      properties: { building: "apartments", "building:levels": "10" },
      geometry: { type: "Polygon", coordinates: polygon },
    },
    {
      type: "Feature",
      id: "bridge",
      properties: { highway: "primary", bridge: "yes", layer: "2" },
      geometry: { type: "LineString", coordinates: [[55.25, 25.18], [55.26, 25.19]] },
    },
    {
      type: "Feature",
      id: "tunnel",
      properties: { highway: "secondary", tunnel: "yes", layer: "-1" },
      geometry: { type: "LineString", coordinates: [[55.26, 25.19], [55.27, 25.2]] },
    },
    {
      type: "Feature",
      id: "park",
      properties: { leisure: "park", name: "Pilot park" },
      geometry: { type: "Polygon", coordinates: polygon },
    },
    {
      type: "Feature",
      id: "landmark-height",
      properties: { building: "yes", landmark: "1", maxheight: "828" },
      geometry: { type: "Polygon", coordinates: polygon },
    },
  ],
};

const buildings = processBuildings(source);
assert.equal(buildings.features.length, 2);
assert.equal(buildings.features[0].properties.height_m, 32);
assert.equal(buildings.features[0].properties.height_source, "osm-levels-estimate");

const roads = processRoads(source);
assert.equal(roads.features.length, 2);
const bridge = roads.features.find((feature) => feature.id === "bridge");
const tunnel = roads.features.find((feature) => feature.id === "tunnel");
assert.equal(bridge?.properties.elevation_m, 13);
assert.equal(bridge?.properties.elevation_source, "configurable-estimate");
assert.equal(tunnel?.properties.render_policy, "hidden-below-ground");

const parks = processParks(source);
assert.equal(parks.features.length, 1);
assert.equal(parks.features[0].id, "park");
const landmark = buildings.features.find((feature) => feature.id === "landmark-height");
assert.equal(landmark?.properties.height_m, 828);
assert.equal(landmark?.properties.height_source, "osm-landmark-maxheight");

console.log("Cesium geodata unit checks passed");
