# FakeGPS Photo - Client-Side GeoTag & Timestamp Annotator

A lightweight, modern web application built with **HTML5**, **Tailwind CSS**, and **Canvas** to stamp authentic GPS coordinates, reverse-geocoded addresses, and date/time with timezone onto any photograph.

**100% Client-Side Processing**: All image rendering, canvas composition, coordinate calculations, and file downloads execute strictly within the user's browser. No images or location data are ever uploaded to any server.

---

## Features

### Step 1: Upload Image
- **Drag-and-Drop or File Picker**: Upload photos in JPG, PNG, WEBP, or GIF formats.
- **Client-Side File Reading**: Images are read into browser memory via HTML5 `FileReader` / `createObjectURL`.
- **Instant Demo Photo**: Built-in procedural canvas generator lets you test immediately with a single click.
- **Original Resolution Preservation**: Maintains original image resolution (from standard mobile photos up to 4K / 12MP+).

### Step 2: Select Data & Customize
- **Location & Coordinates**:
  - Direct decimal degree inputs (Latitude & Longitude).
  - Automatic dual DMS conversion (Degrees, Minutes, Seconds: e.g. `40° 45' 28.8" N, 73° 59' 7.8" W`).
  - Quick location presets: Times Square (New York), Eiffel Tower (Paris), Shibuya Crossing (Tokyo), Big Ben (London).
  - Browser geolocation (`navigator.geolocation`) with one-click "Use current location".
  - **Embedded OpenStreetMap**: Compact 150px interactive Leaflet map using unblocked OpenStreetMap tiles (`osmfr` / `osmde`). Clicking or dragging the pin updates coordinates and triggers reverse geocoding.
  - **CORS-Safe Reverse Geocoding**:
    - **Photon (Komoot OpenStreetMap Geocoder)**: Open CORS (`Access-Control-Allow-Origin: *`), detailed street addresses and landmarks, zero API key required, zero CORS errors.
    - **BigDataCloud Reverse Geocode**: Secondary open-CORS fallback.
    - **Geodetic Coordinates**: Offline fallback.
- **Date, Time & Timezone**:
  - Customizable date and time picker (defaults to current time with "Set to current time" button).
  - Timezone selector supporting major global zones (EST, PST, GMT, CET, JST, BST, UTC, etc.).
  - Auto-calculated UTC/GMT timezone offset suffix (e.g. `GMT+09:00`, `GMT-04:00`).
- **Overlay Format**:
  - **Coverage**: Exact bottom 20% of the picture height spanning full image width.
  - **Color**: 40% transparent black rectangle (`rgba(0, 0, 0, 0.40)`).
  - **Edges**: 0 border radius / sharp corners (no rounded corners).
  - **Typography**: Tight monospace font stack (`ui-monospace, "SF Mono", Menlo, Consolas, monospace`) with high-contrast text shadow for maximum legibility on any image background.
  - **Content**:
    - Line 1: `GPS:  <Decimal Coords>  [<DMS Coords>]`
    - Line 2: `LOC:  <Address>` (word-wrapped cleanly if long)
    - Line 3: `TIME: <Date & Time> <Timezone Suffix>` (plus optional altitude and tag)
  - Real OpenStreetMap square thumbnail with red crosshair pin in the overlay.

### Download Annotated Image
- **Full-Resolution Export**: Stamps are re-rendered on an offscreen canvas at the exact native resolution of the uploaded photo.
- **Client-Side Blob**: Generates a JPEG Blob locally and triggers standard browser file download without touching any backend.

---

## How to Run

### Option 1: Python
```bash
python3 -m http.server 3000
```
Then open `http://localhost:3000` in your web browser.

### Option 2: Node.js / npx
```bash
npm start
# or
npx serve -l 3000 .
```

---

## Deployment

This project is pre-configured for automated deployment to **GitHub Pages** via GitHub Actions.

### Setup on GitHub:
1. Push this repository to GitHub.
2. Navigate to **Settings** > **Pages** in your repository.
3. Under **Build and deployment** > **Source**, select **GitHub Actions**.
4. Any push to `main` (or `master`) or manual trigger via **Run workflow** in the Actions tab will automatically validate and publish the site.
