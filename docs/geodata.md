# Metro Import from Google Maps — Manual Process

**Google Maps Link:** https://www.google.com/maps/d/u/0/viewer?mid=1_gUNTCMw_3ltChX8p5DHiDTr3o3n5Pc

Since Google Maps custom maps don't have a public API, extraction requires manual steps:

## Step 1: Export Metro Data from Google Maps

1. Open the link above in your browser
2. Click **⋮ (menu)** → **Download KML** or **Export**
3. Save the `.kml` file to the project:
   ```
   supabase/metro-import.kml
   ```

## Step 2: Parse KML to Station Coordinates

The KML contains `<Placemark>` elements for each station. Each has:
```xml
<name>Station Name</name>
<Point>
  <coordinates>lng,lat,0</coordinates>
</Point>
```

And polyline `<LineString>` elements for metro lines.

## Step 3: Map Stations to metroAccurate.ts

1. For each line (Red, Green, Blue, etc.), create a stations array:
   ```typescript
   const STATION_NAME_STATIONS = [
     { name: "Station 1", coord: [lng, lat], interchange?: true },
     { name: "Station 2", coord: [lng, lat] },
   ];
   ```

2. Update the `MetroLine` objects in `src/lib/metroAccurate.ts`:
   ```typescript
   export const METRO_LINES = [
     {
       id: "red-line",
       name: "Red Line",
       status: "operational",
       stations: RED_LINE_STATIONS,
       path: RED_LINE_STATIONS.map(s => s.coord),
       category: "red",
       color: CATEGORY_COLORS.red,
     },
     // ... more lines
   ];
   ```

## Step 4: Verify & Test

1. Run type check:
   ```bash
   npx tsc --noEmit
   ```

2. Start dev server:
   ```bash
   npm run dev
   ```

3. Check:
   - All stations render on the map
   - Polylines connect without gaps
   - Interchanges are marked
   - Zoom levels show proper detail

## Data Format Reference

### Station Object
```typescript
{
  id: "unique-id",
  name: "Official Name",
  coord: [55.3154, 25.2663],  // [lng, lat]
  interchange?: boolean,       // true if connects to other lines
}
```

### Line Object
```typescript
{
  id: "line-id",
  name: "Line Name",
  status: "operational" | "under-construction" | "planned-2030",
  category: "red" | "green" | "blue" | "yellow" | "pink" | "tram" | "future" | "train",
  stations: MetroStation[],
  path: [number, number][],  // polyline from station coords
  color: string,             // hex color code
}
```

## Troubleshooting

- **Polyline gaps:** Check station coords match between `stations` array and `path` array
- **Missing stations:** Verify all `<Placemark>` elements were extracted
- **Wrong coordinates:** KML uses [lng, lat,0]; ensure you extract as [lng, lat]
- **Interchange duplicates:** If a station appears on multiple lines, add to each line's stations array (duplication is OK—each line has its own instance)

## Files to Edit

- `src/lib/metroAccurate.ts` — Station + line data
- `src/lib/metro.ts` — Category colors (if adding new line types)

After editing, run `npm run build` and test in dev/production.
