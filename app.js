/**
 * FakeGPS Photo - 100% Client-Side Image Annotator
 * All processing, rendering, and file handling happen strictly within the browser.
 * Zero bytes sent to any remote server.
 */

// Application State
const state = {
  currentImage: null,
  imageFileName: 'photo.jpg',
  originalWidth: 0,
  originalHeight: 0,
  coords: {
    lat: 40.7580,
    lng: -73.9855
  },
  address: 'Times Square, Manhattan, New York, NY 10036, United States',
  altitude: '18.2 m',
  note: 'GPS Map Camera',
  datetime: '',
  timezoneName: 'America/New_York',
  timezoneDisplay: 'GMT-04:00',
  scale: 'normal',
  showMinimap: true,
  leafletMap: null,
  mapMarker: null,
  mapInitialized: false
};

// DOM Elements
const dom = {
  // Navigation / Stepper
  step1Container: document.getElementById('step1-container'),
  step2Container: document.getElementById('step2-container'),
  navStep1Btn: document.getElementById('nav-step1-btn'),
  navStep2Btn: document.getElementById('nav-step2-btn'),
  
  // Step 1 Elements
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  loadSampleBtn: document.getElementById('load-sample-btn'),
  
  // Step 2 Form Elements
  changeImageBtn: document.getElementById('change-image-btn'),
  imageMetaInfo: document.getElementById('image-meta-info'),
  exportResLabel: document.getElementById('export-res-label'),
  geolocateBtn: document.getElementById('geolocate-btn'),
  inputLat: document.getElementById('input-latitude'),
  inputLng: document.getElementById('input-longitude'),
  inputAddress: document.getElementById('input-address'),
  inputAltitude: document.getElementById('input-altitude'),
  lookupAddressBtn: document.getElementById('lookup-address-btn'),
  geocodeAddressBtn: document.getElementById('geocode-address-btn'),
  mapContainer: document.getElementById('map-container'),
  reverseStatus: document.getElementById('reverse-status'),
  // Date & Time Elements
  setNowBtn: document.getElementById('set-now-btn'),
  inputDatetime: document.getElementById('input-datetime'),
  inputTimezone: document.getElementById('input-timezone'),
  inputTzDisplay: document.getElementById('input-tz-display'),
  
  // Style Elements
  stampSize: document.getElementById('stamp-size'),
  showMinimap: document.getElementById('show-minimap'),
  
  // Preview & Export
  previewCanvas: document.getElementById('preview-canvas'),
  previewSpinner: document.getElementById('preview-spinner'),
  downloadBtn: document.getElementById('download-btn'),
  presetButtons: document.querySelectorAll('.preset-btn')
};

// ==========================================
// Tile Cache for OpenStreetMap mini-map
// ==========================================
const osmTileCache = new Map();

function getOsmTile(zoom, x, y) {
  const subdomains = ['a', 'b', 'c'];
  const s = subdomains[Math.abs((x + y) % 3)];
  const key = `${zoom}/${x}/${y}`;
  if (osmTileCache.has(key)) {
    return osmTileCache.get(key);
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    scheduleRender();
  };
  img.onerror = () => {
    if (!img._retried) {
      img._retried = true;
      img.src = `https://${s}.tile.openstreetmap.de/${zoom}/${x}/${y}.png`;
    }
  };
  // OpenStreetMap tile server: 100% genuine OSM, open CORS, zero API key, zero watermarks
  img.src = `https://${s}.tile.openstreetmap.fr/osmfr/${zoom}/${x}/${y}.png`;
  osmTileCache.set(key, img);
  return img;
}

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initDateTime();
  initEventListeners();
  initIcons();
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Set initial date & time to current browser local time
function initDateTime() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  dom.inputDatetime.value = localIso;
  state.datetime = localIso;

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      state.timezoneName = tz;
      let found = false;
      for (const opt of dom.inputTimezone.options) {
        if (opt.value === tz) {
          dom.inputTimezone.value = tz;
          found = true;
          break;
        }
      }
      if (!found) {
        const opt = new Option(`${tz} (Local)`, tz, true, true);
        dom.inputTimezone.add(opt, 0);
      }
    }
  } catch (e) {
    console.warn('Could not detect timezone, using default:', e);
  }

  updateTimezoneOffsetDisplay();
}

// Compute timezone display string 100% client-side
function updateTimezoneOffsetDisplay() {
  try {
    const selectedDate = state.datetime ? new Date(state.datetime) : new Date();
    const tz = dom.inputTimezone.value;
    
    if (tz === 'custom') {
      return;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset'
    });
    const parts = formatter.formatToParts(selectedDate);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    
    if (tzPart && tzPart.value) {
      let offsetStr = tzPart.value;
      if (/^GMT[+-]\d+$/.test(offsetStr)) {
        const sign = offsetStr.includes('+') ? '+' : '-';
        const num = offsetStr.replace(/[^0-9]/g, '');
        offsetStr = `GMT${sign}${num.padStart(2, '0')}:00`;
      }
      dom.inputTzDisplay.value = offsetStr;
      state.timezoneDisplay = offsetStr;
    } else {
      const offsetMin = -selectedDate.getTimezoneOffset();
      const sign = offsetMin >= 0 ? '+' : '-';
      const absMin = Math.abs(offsetMin);
      const h = String(Math.floor(absMin / 60)).padStart(2, '0');
      const m = String(absMin % 60).padStart(2, '0');
      const fallbackStr = `GMT${sign}${h}:${m}`;
      dom.inputTzDisplay.value = fallbackStr;
      state.timezoneDisplay = fallbackStr;
    }
  } catch (err) {
    console.warn('Error computing timezone offset:', err);
  }
}

// ==========================================
// Event Listeners Setup
// ==========================================
function initEventListeners() {
  // Drag & Drop
  ['dragenter', 'dragover'].forEach(name => {
    dom.dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.dropZone.classList.add('border-slate-500', 'bg-slate-800');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dom.dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.dropZone.classList.remove('border-slate-500', 'bg-slate-800');
    });
  });

  dom.dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleImageFile(files[0]);
    }
  });

  dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  // Load Built-in Demo Photo
  dom.loadSampleBtn.addEventListener('click', () => {
    generateClientSideDemoPhoto();
  });

  // Step Switchers
  dom.changeImageBtn.addEventListener('click', () => {
    switchStep(1);
  });
  dom.navStep1Btn.addEventListener('click', () => {
    switchStep(1);
  });
  dom.navStep2Btn.addEventListener('click', () => {
    if (state.currentImage) switchStep(2);
  });

  // Coordinates & Address Inputs
  dom.inputLat.addEventListener('input', (e) => {
    state.coords.lat = parseFloat(e.target.value) || 0;
    updateMapMarker(true);
    scheduleRender();
  });
  dom.inputLng.addEventListener('input', (e) => {
    state.coords.lng = parseFloat(e.target.value) || 0;
    updateMapMarker(true);
    scheduleRender();
  });
  dom.inputAddress.addEventListener('input', (e) => {
    state.address = e.target.value;
    scheduleRender();
  });
  dom.inputAltitude.addEventListener('input', (e) => {
    state.altitude = e.target.value;
    scheduleRender();
  });

  // Presets
  dom.presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      const name = btn.dataset.name;
      const tz = btn.dataset.tz;

      dom.inputLat.value = lat;
      dom.inputLng.value = lng;
      dom.inputAddress.value = name;
      state.coords.lat = lat;
      state.coords.lng = lng;
      state.address = name;

      if (tz) {
        dom.inputTimezone.value = tz;
        state.timezoneName = tz;
        updateTimezoneOffsetDisplay();
      }

      updateMapMarker(true);
      scheduleRender();
    });
  });

  // Geolocate with browser navigator.geolocation
  dom.geolocateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    dom.geolocateBtn.innerHTML = '<span class="inline-block animate-spin mr-1">⌛</span> Locating...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        dom.inputLat.value = lat;
        dom.inputLng.value = lng;
        state.coords.lat = lat;
        state.coords.lng = lng;

        if (pos.coords.altitude) {
          const alt = `${pos.coords.altitude.toFixed(1)} m`;
          dom.inputAltitude.value = alt;
          state.altitude = alt;
        }

        performClientReverseGeocode(lat, lng);
        updateMapMarker(true);
        dom.geolocateBtn.innerHTML = '<i data-lucide="crosshair" class="w-3 h-3 inline"></i> <span>Use current location</span>';
        initIcons();
        scheduleRender();
      },
      (err) => {
        dom.geolocateBtn.innerHTML = '<i data-lucide="crosshair" class="w-3 h-3 inline"></i> <span>Use current location</span>';
        initIcons();
        alert('Could not acquire location: ' + err.message);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  });

  // Reverse Geocode Button (Coordinates -> Address)
  dom.lookupAddressBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const lat = parseFloat(dom.inputLat.value);
    const lng = parseFloat(dom.inputLng.value);
    if (isNaN(lat) || isNaN(lng)) {
      dom.reverseStatus.textContent = 'Please enter valid coordinates';
      return;
    }
    state.coords.lat = lat;
    state.coords.lng = lng;
    updateMapMarker(true);
    performClientReverseGeocode(lat, lng, true);
  });

  // Forward Geocode Button (Address -> Coordinates & Map)
  if (dom.geocodeAddressBtn) {
    dom.geocodeAddressBtn.addEventListener('click', (e) => {
      e.preventDefault();
      performForwardGeocode(dom.inputAddress.value, true);
    });
  }

  // Pressing Enter in Address field triggers Find on map
  dom.inputAddress.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performForwardGeocode(dom.inputAddress.value, true);
    }
  });
  // Date & Time
  dom.setNowBtn.addEventListener('click', () => {
    initDateTime();
    scheduleRender();
  });

  dom.inputDatetime.addEventListener('input', (e) => {
    state.datetime = e.target.value;
    updateTimezoneOffsetDisplay();
    scheduleRender();
  });

  dom.inputTimezone.addEventListener('change', (e) => {
    state.timezoneName = e.target.value;
    updateTimezoneOffsetDisplay();
    scheduleRender();
  });

  dom.inputTzDisplay.addEventListener('input', (e) => {
    state.timezoneDisplay = e.target.value;
    scheduleRender();
  });

  // Style Settings
  dom.stampSize.addEventListener('change', (e) => {
    state.scale = e.target.value;
    scheduleRender();
  });

  dom.showMinimap.addEventListener('change', (e) => {
    state.showMinimap = e.target.checked;
    scheduleRender();
  });

  // Download
  dom.downloadBtn.addEventListener('click', handleDownload);
}

// ==========================================
// Step Navigation
// ==========================================
function switchStep(stepNumber) {
  if (stepNumber === 1) {
    dom.step1Container.classList.remove('hidden');
    dom.step2Container.classList.add('hidden');
    
    dom.navStep1Btn.className = "flex items-center gap-1 px-2 py-0.5 rounded text-white bg-slate-800 border border-slate-700 transition-colors";
    dom.navStep2Btn.className = "flex items-center gap-1 px-2 py-0.5 rounded text-slate-400 hover:text-slate-200 transition-colors";
  } else if (stepNumber === 2 && state.currentImage) {
    dom.step1Container.classList.add('hidden');
    dom.step2Container.classList.remove('hidden');
    
    dom.navStep1Btn.className = "flex items-center gap-1 px-2 py-0.5 rounded text-slate-400 hover:text-slate-200 transition-colors";
    dom.navStep2Btn.className = "flex items-center gap-1 px-2 py-0.5 rounded text-white bg-slate-800 border border-slate-700 transition-colors";
    dom.navStep2Btn.disabled = false;

    scheduleRender();
    initLeafletMapIfNeeded();
  }
}

// ==========================================
// Client-Side Image Loading & Processing
// ==========================================
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('Please select a valid image file (JPEG, PNG, WEBP, etc.)');
    return;
  }

  state.imageFileName = file.name || 'annotated_photo.jpg';

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.currentImage = img;
      state.originalWidth = img.naturalWidth || img.width;
      state.originalHeight = img.naturalHeight || img.height;

      dom.imageMetaInfo.textContent = `Original: ${state.originalWidth} × ${state.originalHeight} px`;
      dom.exportResLabel.textContent = `${state.originalWidth} × ${state.originalHeight} (Full Res)`;

      switchStep(2);
    };
    img.onerror = () => {
      alert('Failed to load image. Please try another file.');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Demo image generator: 100% client-side canvas painting of a scenic skyline
function generateClientSideDemoPhoto() {
  const canvas = document.createElement('canvas');
  const w = 1920;
  const h = 1080;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Sunset Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  skyGrad.addColorStop(0, '#0f172a');
  skyGrad.addColorStop(0.3, '#1e1b4b');
  skyGrad.addColorStop(0.6, '#4c1d95');
  skyGrad.addColorStop(0.85, '#be185d');
  skyGrad.addColorStop(1, '#f97316');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Stars
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 90; i++) {
    const sx = Math.sin(i * 997) * 0.5 + 0.5;
    const sy = Math.cos(i * 311) * 0.5 + 0.5;
    const r = (Math.sin(i * 43) * 0.5 + 0.5) * 1.6 + 0.5;
    ctx.globalAlpha = (Math.sin(i * 71) * 0.5 + 0.5) * 0.8 + 0.2;
    ctx.beginPath();
    ctx.arc(sx * w, sy * h * 0.5, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  // Sun Glow
  const sunGrad = ctx.createRadialGradient(w * 0.65, h * 0.62, 10, w * 0.65, h * 0.62, 320);
  sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
  sunGrad.addColorStop(0.3, 'rgba(251, 146, 60, 0.6)');
  sunGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(w * 0.65, h * 0.62, 320, 0, Math.PI * 2);
  ctx.fill();

  // Mountain Silhouette
  ctx.fillStyle = '#1e1135';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.65);
  for (let x = 0; x <= w; x += 40) {
    const y = h * 0.62 + Math.sin(x * 0.005) * 60 + Math.cos(x * 0.013) * 30;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Buildings Silhouette
  ctx.fillStyle = '#090514';
  const buildings = [
    { x: 50, w: 90, h: 320 },
    { x: 160, w: 70, h: 420 },
    { x: 250, w: 110, h: 260 },
    { x: 380, w: 80, h: 490 },
    { x: 480, w: 140, h: 380 },
    { x: 640, w: 100, h: 560 },
    { x: 760, w: 120, h: 340 },
    { x: 900, w: 160, h: 450 },
    { x: 1080, w: 110, h: 510 },
    { x: 1210, w: 90, h: 310 },
    { x: 1320, w: 130, h: 460 },
    { x: 1470, w: 150, h: 390 },
    { x: 1640, w: 110, h: 480 },
    { x: 1770, w: 120, h: 330 }
  ];

  buildings.forEach(b => {
    ctx.fillRect(b.x, h - b.h, b.w, b.h);
    ctx.fillStyle = 'rgba(254, 240, 138, 0.65)';
    for (let r = h - b.h + 20; r < h - 40; r += 24) {
      for (let c = b.x + 12; c < b.x + b.w - 12; c += 16) {
        if ((r * 13 + c * 7) % 5 > 1) {
          ctx.fillRect(c, r, 7, 12);
        }
      }
    }
    ctx.fillStyle = '#090514';
  });

  const img = new Image();
  img.onload = () => {
    state.currentImage = img;
    state.imageFileName = 'demo_city_skyline.jpg';
    state.originalWidth = w;
    state.originalHeight = h;
    dom.imageMetaInfo.textContent = `Original: ${w} × ${h} px (Demo Generated)`;
    dom.exportResLabel.textContent = `${w} × ${h} (Full Res)`;
    switchStep(2);
  };
  img.src = canvas.toDataURL('image/jpeg', 0.95);
}

// ==========================================
// Interactive Map (Leaflet / OSM) Setup
// ==========================================
function initLeafletMapIfNeeded() {
  if (!window.L) return;

  const lat = state.coords.lat;
  const lng = state.coords.lng;

  // Custom SVG Map Pin (pixel-perfect alignment with clicked point at bottom tip [12, 32])
  const pinIcon = L.divIcon({
    className: 'custom-map-pin',
    html: `
      <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));">
        <path d="M12 0C5.37 0 0 5.37 0 12C0 20.25 12 32 12 32C12 32 24 20.25 24 12C24 5.37 18.63 0 12 0Z" fill="#ef4444"/>
        <circle cx="12" cy="11" r="4.5" fill="#ffffff"/>
      </svg>
    `,
    iconSize: [24, 32],
    iconAnchor: [12, 32]
  });
  if (!state.mapInitialized) {
    state.leafletMap = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([lat, lng], 14);

    // OpenStreetMap Tile Layer: free, open CORS, no API key, no watermarks
    L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.leafletMap);

    state.mapMarker = L.marker([lat, lng], {
      draggable: true,
      icon: pinIcon
    }).addTo(state.leafletMap);

    state.mapMarker.on('dragend', () => {
      const pos = state.mapMarker.getLatLng();
      setCoordinatesFromMap(pos.lat, pos.lng);
    });

    state.leafletMap.on('click', (e) => {
      state.mapMarker.setLatLng(e.latlng);
      setCoordinatesFromMap(e.latlng.lat, e.latlng.lng);
    });

    state.mapInitialized = true;
  }

  // Always invalidate size when displayed to avoid 0x0 tile glitch
  setTimeout(() => {
    if (state.leafletMap) {
      state.leafletMap.invalidateSize();
      state.leafletMap.setView([state.coords.lat, state.coords.lng], 14);
    }
  }, 100);
}

function updateMapMarker(pan = false) {
  if (state.mapMarker && state.leafletMap) {
    state.mapMarker.setLatLng([state.coords.lat, state.coords.lng]);
    if (pan) {
      state.leafletMap.setView([state.coords.lat, state.coords.lng], 14);
    }
  }
}

function setCoordinatesFromMap(lat, lng) {
  const roundedLat = parseFloat(lat.toFixed(6));
  const roundedLng = parseFloat(lng.toFixed(6));
  state.coords.lat = roundedLat;
  state.coords.lng = roundedLng;
  dom.inputLat.value = roundedLat;
  dom.inputLng.value = roundedLng;
  scheduleRender();
  performClientReverseGeocode(roundedLat, roundedLng);
}

// ==========================================
// Forward Geocoding (Address -> Coordinates & Map)
// ==========================================
async function performForwardGeocode(query, isUserAction = true) {
  const btn = dom.geocodeAddressBtn;
  const q = (query || dom.inputAddress.value || '').trim();
  if (!q) {
    dom.reverseStatus.textContent = 'Please enter an address first';
    return;
  }

  dom.reverseStatus.textContent = `Finding: ${q.slice(0, 22)}...`;
  if (isUserAction && btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin text-[10px]">⏳</span> <span>Locating...</span>`;
  }

  let foundLat = null;
  let foundLng = null;

  // 1. Try Nominatim Search
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
    const nomRes = await fetch(nomUrl, { headers: { 'Accept-Language': 'en' } });
    if (nomRes.ok) {
      const data = await nomRes.json();
      if (Array.isArray(data) && data.length > 0) {
        foundLat = parseFloat(data[0].lat);
        foundLng = parseFloat(data[0].lon);
      }
    }
  } catch (err) {
    console.info('Nominatim forward search fallback:', err.message);
  }

  // 2. Try Photon Komoot Search (Fallback)
  if (foundLat === null || isNaN(foundLat)) {
    try {
      const photUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
      const photRes = await fetch(photUrl);
      if (photRes.ok) {
        const pData = await photRes.json();
        if (pData && pData.features && pData.features.length > 0) {
          const coords = pData.features[0].geometry.coordinates;
          foundLng = parseFloat(coords[0]);
          foundLat = parseFloat(coords[1]);
        }
      }
    } catch (err) {
      console.info('Photon forward search fallback:', err.message);
    }
  }

  if (foundLat !== null && !isNaN(foundLat) && foundLng !== null && !isNaN(foundLng)) {
    const rLat = parseFloat(foundLat.toFixed(6));
    const rLng = parseFloat(foundLng.toFixed(6));
    state.coords.lat = rLat;
    state.coords.lng = rLng;
    dom.inputLat.value = rLat;
    dom.inputLng.value = rLng;
    state.address = q;

    // Pan map & update pin
    updateMapMarker(true);
    scheduleRender();

    dom.reverseStatus.textContent = 'Found on map';

    if (btn) {
      btn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> <span>Located!</span>`;
      initIcons();
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="search" class="w-3 h-3"></i> <span>Find on map</span>`;
        initIcons();
      }, 1800);
    }
    setTimeout(() => { dom.reverseStatus.textContent = ''; }, 3500);
  } else {
    dom.reverseStatus.textContent = 'Could not find location';
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="search" class="w-3 h-3"></i> <span>Find on map</span>`;
      initIcons();
    }
    setTimeout(() => { dom.reverseStatus.textContent = ''; }, 3500);
  }
}

// ==========================================
// Reverse Geocoding (Coordinates -> Address)
// ==========================================
async function performClientReverseGeocode(lat, lng, isUserAction = false) {
  dom.reverseStatus.textContent = 'Looking up address...';
  const btn = dom.lookupAddressBtn;
  
  if (isUserAction && btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin text-[10px]">⏳</span> <span>Locating...</span>`;
  }
  
  const dmsLat = formatDMS(lat, true);
  const dmsLng = formatDMS(lng, false);

  const finishLookup = (addressText, success = true) => {
    if (addressText) {
      state.address = addressText;
      dom.inputAddress.value = addressText;
    }
    dom.reverseStatus.textContent = success ? 'Address updated' : 'Coordinates set';
    scheduleRender();

    if (btn) {
      if (isUserAction && success) {
        btn.innerHTML = `<i data-lucide="check" class="w-2.5 h-2.5 text-emerald-400"></i> <span>Updated</span>`;
        initIcons();
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = `<i data-lucide="refresh-cw" class="w-2.5 h-2.5 text-blue-400"></i> <span>Get address from coords</span>`;
          initIcons();
        }, 1800);
      } else {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="refresh-cw" class="w-2.5 h-2.5 text-blue-400"></i> <span>Get address from coords</span>`;
        initIcons();
      }
    }
    setTimeout(() => { dom.reverseStatus.textContent = ''; }, 3000);
  };

  // 1. Photon (Komoot OpenStreetMap Geocoder)
  // Genuine OSM data with full CORS support (Access-Control-Allow-Origin: *)
  try {
    const photUrl = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const photRes = await fetch(photUrl);
    if (photRes.ok) {
      const data = await photRes.json();
      if (data && data.features && data.features.length > 0) {
        const p = data.features[0].properties;
        const parts = [];
        if (p.name) parts.push(p.name);
        if (p.street) {
          const streetLine = p.housenumber ? `${p.housenumber} ${p.street}` : p.street;
          if (!parts.includes(streetLine) && streetLine !== p.name) {
            parts.push(streetLine);
          }
        }
        if (p.district && !parts.includes(p.district) && p.district !== p.city) {
          parts.push(p.district);
        }
        if (p.city && !parts.includes(p.city)) {
          parts.push(p.city);
        }
        if (p.state && !parts.includes(p.state)) {
          parts.push(p.state);
        }
        if (p.postcode && !parts.includes(p.postcode)) {
          parts.push(p.postcode);
        }
        if (p.country && !parts.includes(p.country)) {
          parts.push(p.country);
        }
        if (parts.length > 0) {
          finishLookup(parts.join(', '), true);
          return;
        }
      }
    }
  } catch (err) {
    console.info('Photon fallback:', err.message);
  }

  // 2. BigDataCloud Client Reverse Geocode
  // Engineered for client-side browsers with open CORS
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
    const bdcRes = await fetch(bdcUrl);
    if (bdcRes.ok) {
      const data = await bdcRes.json();
      if (data) {
        const parts = [];
        if (data.locality && data.locality !== data.city) parts.push(data.locality);
        if (data.city) parts.push(data.city);
        if (data.principalSubdivision) parts.push(data.principalSubdivision);
        if (data.countryName) parts.push(data.countryName);
        if (parts.length > 0) {
          finishLookup(parts.join(', '), true);
          return;
        }
      }
    }
  } catch (err) {
    console.info('BigDataCloud fallback:', err.message);
  }

  // 3. Final Fallback: formatted coordinates
  const clientFallback = `Location (${dmsLat}, ${dmsLng})`;
  finishLookup(clientFallback, false);
}

// Convert decimal degrees to DMS format (Degrees, Minutes, Seconds)
function formatDMS(deg, isLat) {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);

  let direction = '';
  if (isLat) {
    direction = deg >= 0 ? 'N' : 'S';
  } else {
    direction = deg >= 0 ? 'E' : 'W';
  }

  return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
}

// ==========================================
// Canvas Overlay Stamp Rendering Engine
// ==========================================
let renderRequestId = null;

function scheduleRender() {
  if (renderRequestId) cancelAnimationFrame(renderRequestId);
  renderRequestId = requestAnimationFrame(() => {
    renderPreview();
  });
}

function renderPreview() {
  if (!state.currentImage) return;

  const canvas = dom.previewCanvas;
  const img = state.currentImage;

  const maxDisplayWidth = 1440;
  let renderWidth = img.naturalWidth || img.width;
  let renderHeight = img.naturalHeight || img.height;

  if (renderWidth > maxDisplayWidth) {
    const scale = maxDisplayWidth / renderWidth;
    renderWidth = Math.round(renderWidth * scale);
    renderHeight = Math.round(renderHeight * scale);
  }

  canvas.width = renderWidth;
  canvas.height = renderHeight;

  const ctx = canvas.getContext('2d');
  
  // 1. Draw source image
  ctx.drawImage(img, 0, 0, renderWidth, renderHeight);

  // 2. Draw Stamp Overlay onto canvas
  drawStamp(ctx, renderWidth, renderHeight);
}

/**
 * 20% Bottom Overlay (Tight Monospace Layout):
 * Covers 20% of the picture height from the bottom with a 40% transparent black rectangle.
 * No rounded corners, strictly monospace font.
 * Contains address, coordinates, and date/time with timezone.
 */
function drawStamp(ctx, width, height) {
  // 1. Calculate banner dimensions: exact 20% of picture height from the bottom
  const bannerHeight = Math.round(height * 0.20);
  const bannerY = height - bannerHeight;
  const bannerWidth = width;

  // 2. Draw 40% transparent black rectangle covering from that area to bottom (no rounded corners)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
  ctx.fillRect(0, bannerY, bannerWidth, bannerHeight);
  ctx.restore();

  // 3. Format metadata
  const dmsLat = formatDMS(state.coords.lat, true);
  const dmsLng = formatDMS(state.coords.lng, false);
  const coordDecimal = `${state.coords.lat.toFixed(5)}°, ${state.coords.lng.toFixed(5)}°`;
  const coordDMS = `${dmsLat}, ${dmsLng}`;
  const dtStr = state.datetime ? state.datetime.replace('T', ' ') : '2026-10-26 14:30:00';
  const tzSuffix = state.timezoneDisplay || 'UTC';
  const dateTimeFormatted = `${dtStr} ${tzSuffix}`;
  const address = state.address || 'Unknown Location';
  const altitude = state.altitude ? `ALT: ${state.altitude}` : '';


  // 4. Tight layout metrics inside banner
  const padX = Math.round(Math.max(10, width * 0.015));
  const padY = Math.round(bannerHeight * 0.07);
  const availHeight = bannerHeight - (padY * 2);

  // Real OpenStreetMap mini-map badge on the left if enabled (sharp square)
  let contentStartX = padX;
  if (state.showMinimap) {
    const badgeSize = Math.round(bannerHeight * 0.86);
    const badgeY = bannerY + Math.round((bannerHeight - badgeSize) / 2);
    const badgeX = padX;
    drawOsmMiniMap(ctx, badgeX, badgeY, badgeSize, state.coords.lat, state.coords.lng);
    contentStartX = badgeX + badgeSize + Math.round(padX * 0.65);
  }

  const maxTextWidth = width - contentStartX - padX;

  // Monospace font stack
  const monoFont = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

  // Scale multiplier supporting small, normal, medium, large
  let scaleMult = 1.0;
  if (state.scale === 'small' || state.scale === 'compact') scaleMult = 0.82;
  else if (state.scale === 'normal') scaleMult = 1.0;
  else if (state.scale === 'medium') scaleMult = 1.18;
  else if (state.scale === 'large') scaleMult = 1.38;

  // Text content lines (No tag)
  const line1 = `GPS:  ${coordDecimal}  [${coordDMS}]`;
  const metaParts = [`TIME: ${dateTimeFormatted}`];
  if (altitude) metaParts.push(altitude);
  const line3 = metaParts.join('  |  ');

  // Prominent, clearly legible font size (~32px on 1920w baseline)
  let fontSize = Math.max(12, Math.round(width * 0.0165 * scaleMult));
  let lineHeight = Math.round(fontSize * 1.28);

  ctx.font = `600 ${fontSize}px ${monoFont}`;

  // Word-wrap address line
  const addrPrefix = 'LOC:  ';
  let addressLines = wrapText(ctx, `${addrPrefix}${address}`, maxTextWidth);
  if (addressLines.length === 0) addressLines = [`${addrPrefix}${address}`];

  // Refine only if lines overflow available height
  const totalLines = 1 + addressLines.length + 1;
  const totalTextHeight = totalLines * lineHeight;
  if (totalTextHeight > availHeight) {
    lineHeight = Math.floor(availHeight / totalLines);
    fontSize = Math.floor(lineHeight * 0.75);
    ctx.font = `600 ${fontSize}px ${monoFont}`;
  }

  // Vertical centering inside banner
  let currentY = bannerY + Math.round((bannerHeight - (totalLines * lineHeight)) / 2) + Math.round(fontSize * 0.95);
  // 5. Draw text using monospace font in pure white with high-contrast text shadow
  ctx.save();
  ctx.font = `600 ${fontSize}px ${monoFont}`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = Math.max(2, Math.round(fontSize * 0.12));
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  // Line 1: Coordinates (Pure white)
  ctx.fillText(line1, contentStartX, currentY);

  // Line 2: Address (Pure white)
  for (const aLine of addressLines) {
    currentY += lineHeight;
    ctx.fillText(aLine, contentStartX, currentY);
  }

  // Line 3: Timestamp & Timezone (Pure white)
  currentY += lineHeight;
  ctx.fillText(line3, contentStartX, currentY);

  ctx.restore();
}

/**
 * Real OpenStreetMap (OSM) Mini-Map Renderer
 * Calculates Web Mercator tiles for (lat, lng), renders tiles from OpenStreetMap with CORS,
 * and overlays target pin with OSM attribution.
 * Sharp square (no rounded corners).
 */
function drawOsmMiniMap(ctx, x, y, size, lat, lng) {
  ctx.save();
  // Sharp square - no rounded corners
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();

  // Dark background while tiles load
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, size, size);

  const zoom = 15;
  const n = Math.pow(2, zoom);
  const xTile = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yTile = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const cx = x + size / 2;
  const cy = y + size / 2;

  // Tile dimension scaling (standard 256px tile)
  const tileScale = Math.max(1, size / 160);
  const scaledTileSize = 256 * tileScale;

  const dx = cx - (xTile * scaledTileSize);
  const dy = cy - (yTile * scaledTileSize);

  const minTileX = Math.floor(xTile - 1);
  const maxTileX = Math.floor(xTile + 1);
  const minTileY = Math.floor(yTile - 1);
  const maxTileY = Math.floor(yTile + 1);

  let loadedAny = false;
  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const tileImg = getOsmTile(zoom, tx, ty);
      const drawX = dx + tx * scaledTileSize;
      const drawY = dy + ty * scaledTileSize;
      if (tileImg && tileImg.complete && tileImg.naturalWidth > 0) {
        ctx.drawImage(tileImg, drawX, drawY, scaledTileSize, scaledTileSize);
        loadedAny = true;
      }
    }
  }

  // Fallback grid lines if tiles are still loading
  if (!loadedAny) {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    const step = size / 5;
    for (let i = 0; i <= size; i += step) {
      ctx.beginPath();
      ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + size);
      ctx.moveTo(x, y + i); ctx.lineTo(x + size, y + i);
      ctx.stroke();
    }
  }

  // Draw Center Location Pin (Crisp Red Dot + White Ring + Crosshair)
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Subtle Crosshair lines
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy);
  ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12);
  ctx.stroke();

  // Attribution badge in corner: "© OSM"
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.fillRect(x, y + size - 12, 34, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('© OSM', x + 2, y + size - 3);

  // Sharp outer border (no rounded corners)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, size, size);

  ctx.restore();
}

// ==========================================
// Full-Resolution Client-Side Export & Download
// ==========================================
function handleDownload() {
  if (!state.currentImage) {
    alert('Please upload an image first.');
    return;
  }

  const origBtnContent = dom.downloadBtn.innerHTML;
  dom.downloadBtn.disabled = true;
  dom.downloadBtn.innerHTML = `
    <span class="inline-block animate-spin mr-1">⏳</span>
    <span>Exporting ${state.originalWidth}×${state.originalHeight}...</span>
  `;

  setTimeout(() => {
    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = state.originalWidth;
      exportCanvas.height = state.originalHeight;
      const exportCtx = exportCanvas.getContext('2d');

      // 1. Draw source image at 100% native resolution
      exportCtx.drawImage(state.currentImage, 0, 0, state.originalWidth, state.originalHeight);

      // 2. Draw high-fidelity stamp
      drawStamp(exportCtx, state.originalWidth, state.originalHeight);

      // 3. Export to Blob 100% client-side
      exportCanvas.toBlob((blob) => {
        if (!blob) {
          alert('Export failed. Please try again.');
          dom.downloadBtn.disabled = false;
          dom.downloadBtn.innerHTML = origBtnContent;
          return;
        }

        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const baseName = (state.imageFileName || 'photo').replace(/\.[^/.]+$/, '');
        const timeTag = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
        a.download = `${baseName}_gps_${timeTag}.jpg`;
        a.href = downloadUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

        dom.downloadBtn.disabled = false;
        dom.downloadBtn.innerHTML = `
          <i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i>
          <span>Downloaded</span>
        `;
        initIcons();

        setTimeout(() => {
          dom.downloadBtn.innerHTML = origBtnContent;
          initIcons();
        }, 3000);

      }, 'image/jpeg', 0.95);

    } catch (err) {
      console.error('Error during client-side export:', err);
      alert('An error occurred during export: ' + err.message);
      dom.downloadBtn.disabled = false;
      dom.downloadBtn.innerHTML = origBtnContent;
      initIcons();
    }
  }, 50);
}

// ==========================================
// Canvas Utility Helpers
// ==========================================

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}
