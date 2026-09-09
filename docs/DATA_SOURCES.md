# Dubai Skyview geographic data sources

The Cesium renderer consumes generated runtime GeoJSON/3D Tiles. Raw geographic data is never loaded by React and is never processed during a Vercel build.

## Source register

| Dataset | Organization | Purpose | Expected input | Processing entry point | Access / license | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| OpenStreetMap | OpenStreetMap contributors | Building footprints, general roads, bridges, tunnels, water and optional administrative boundaries | Pilot Overpass JSON at `data/geodata/raw/osm/business-bay-downtown.overpass.json`, or production PBF at `data/geodata/raw/osm/uae-latest.osm.pbf` | `download-osm-dubai.ts`, `process-osm.ts` | ODbL 1.0; visible attribution and derived-database obligations apply | Required primary general geometry source |
| `dm_building_summary_information-open` | Dubai Municipality / Dubai Pulse | Official building metadata and verified height where a reliable match exists | `data/geodata/raw/dubai-pulse/Building_Summary_Information.csv` | `import-dubai-municipality-buildings.ts`, `merge-building-metadata.ts` | Download/permission may be required; retain source attribution and portal terms | OSM height, OSM levels estimate, then documented type estimate |
| `dm_community-open` | Dubai Municipality / Dubai Pulse | Official community polygons | `data/geodata/raw/dubai-pulse/Community.kml` | `process-communities.ts` | Download/permission may be required; retain source attribution and portal terms | OSM administrative polygons only when present; otherwise omit rather than fabricate |
| `rta_major_roads-open` | Roads and Transport Authority / Dubai Pulse | Priority geometry for major roads | `data/geodata/raw/dubai-pulse/Major_Roads.kml` | `import-rta-major-roads.ts`, `generate-runtime-geodata.ts` | Download/permission may be required; retain source attribution and portal terms | OSM road network |

## Current pilot provenance

The committed Business Bay / Downtown pilot was generated from OpenStreetMap on 2026-09-09. It contains:

- 1,202 building footprints;
- 1,157 road segments;
- 24 bridge segments;
- 7 tunnel segments (marked with the hidden-below-ground render policy);
- 9 water features.

No Dubai Pulse CSV/KML file was available during this generation. Consequently:

- zero buildings claim an official Dubai Municipality height;
- 386 buildings use `height=*` from OSM;
- 81 use `building:levels × 3.2 m` and are marked estimated;
- 735 use the documented conservative type default and are marked estimated;
- no community polygon is emitted, because neither official KML nor a suitable OSM administrative polygon was present in the pilot response;
- RTA geometry is not mixed into the committed road output.

## Generation

Small development pilot:

```bash
npm run geodata:pilot
```

Production-scale local PBF processing:

```bash
npm run geodata:process:osm -- --pbf data/geodata/raw/osm/uae-latest.osm.pbf
npm run geodata:generate
npm run geodata:validate
```

The current PBF processor streams the source and filters the configured area. It supports tagged ways and assembles retained outer relation members. A citywide release should run district-by-district and emit multiple deterministic chunks (or convert them to 3D Tiles) rather than one city file.

## Height and matching policy

Height priority is:

1. Dubai Municipality height only after an explicit official building-ID match;
2. OSM `height`;
3. OSM `building:levels × 3.2 m`;
4. conservative type default from `scripts/geodata/config.ts`.

Probable name/community matches keep the official height only as a candidate field. They do not promote it to `official_height_m`. Each official match has a confidence label. Unmatched records remain unmatched.

## OSM attribution and derived data

The 3D view displays “© OpenStreetMap contributors” linked to the OSM copyright page whenever OSM-derived data is visible. Do not remove it. Before distributing a citywide derived database, review the ODbL attribution, notice and share-alike requirements for the exact distribution model. Generated assets retain `source`, `generatedAt`, `pipelineVersion`, bounds and license metadata.

## Update strategy

- Re-run the pilot only when testing pipeline changes or refreshing its source snapshot.
- Process production PBF/Dubai Pulse inputs offline in a controlled GIS preparation job.
- Publish large runtime chunks or 3D Tiles to suitable static/object storage with CORS and caching.
- Point the runtime manifest at those immutable versioned assets.
- Never download large source files during `vite build` or a Vercel deployment.

