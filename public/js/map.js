// Map state
let map;
let drawnPoints = [];
let snappedCoords = [];
let routePolyline = null;
let markerLayer = null;
let currentDistanceKm = null;
let savedRouteId = null;

// Initialize map centered on the US
function initMap() {
    map = L.map('map').setView([39.5, -98.35], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);

    map.on('click', onMapClick);
}

// Add a point when the map is clicked
function onMapClick(e) {
    const { lat, lng } = e.latlng;
    drawnPoints.push([lat, lng]);

    L.circleMarker([lat, lng], {
        radius: 6,
        color: '#ff7800',
        fillColor: '#ff7800',
        fillOpacity: 0.8
    }).addTo(markerLayer);

    // Draw a raw preview line while placing points
    if (routePolyline) {
        map.removeLayer(routePolyline);
    }

    if (drawnPoints.length > 1) {
        routePolyline = L.polyline(drawnPoints, { color: '#aaa', dashArray: '6' }).addTo(map);
    }

    if (drawnPoints.length >= 2) {
        document.getElementById('snapBtn').disabled = false;
    }
}

// Geocode search
async function searchLocation() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    setStatus('Searching...', 'text-muted');

    try {
        const res = await fetch(`/api/activity/geocode?query=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (!res.ok) {
            setStatus(data.error || 'Location not found', 'text-danger');
            return;
        }

        map.setView([data.lat, data.lon], 14);
        setStatus(`Found: ${data.display_name}`, 'text-success');
    } catch (err) {
        setStatus('Search failed', 'text-danger');
    }
}

// Snap drawn points to roads via ORS
async function snapToRoads() {
    if (drawnPoints.length < 2) return;

    setStatus('Snapping to roads...', 'text-muted');
    document.getElementById('snapBtn').disabled = true;

    try {
        const res = await fetch('/api/activity/snap-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates: drawnPoints })
        });

        const data = await res.json();

        if (!res.ok) {
            setStatus(data.error || 'Snap failed', 'text-danger');
            document.getElementById('snapBtn').disabled = false;
            return;
        }

        snappedCoords = data.coordinates;
        currentDistanceKm = parseFloat(data.distance_km);

        // Replace preview line with snapped route
        if (routePolyline) map.removeLayer(routePolyline);
        markerLayer.clearLayers();

        routePolyline = L.polyline(snappedCoords, { color: '#fc4c02', weight: 4 }).addTo(map);
        map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });

        // Show distance and activity form
        const distanceMi = (currentDistanceKm * 0.621371).toFixed(2);
        document.getElementById('distanceDisplay').classList.remove('d-none');
        document.getElementById('distanceBadge').textContent = `${distanceMi} mi`;
        document.getElementById('distanceBadgeKm').textContent = `${currentDistanceKm.toFixed(2)} km`;
        document.getElementById('activityForm').classList.remove('d-none');

        setStatus('Route snapped successfully!', 'text-success');
    } catch (err) {
        setStatus('Snap request failed', 'text-danger');
        document.getElementById('snapBtn').disabled = false;
    }
}

// Clear everything and start over
function clearRoute() {
    drawnPoints = [];
    snappedCoords = [];
    currentDistanceKm = null;
    savedRouteId = null;

    if (routePolyline) {
        map.removeLayer(routePolyline);
        routePolyline = null;
    }

    markerLayer.clearLayers();

    document.getElementById('snapBtn').disabled = true;
    document.getElementById('distanceDisplay').classList.add('d-none');
    document.getElementById('activityForm').classList.add('d-none');
    setStatus('', '');
}

// Save route to database
async function saveRoute() {
    const coords = snappedCoords.length ? snappedCoords : drawnPoints;
    const name = document.getElementById('activityName').value.trim() || 'My Walk';
    const sportType = document.getElementById('sportType').value;

    if (!coords.length) {
        setStatus('No route to save', 'text-danger');
        return;
    }

    setStatus('Saving route...', 'text-muted');

    try {
        const res = await fetch('/api/activity/save-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                sport_type: sportType,
                coordinates: coords,
                distance_km: currentDistanceKm
            })
        });

        const data = await res.json();

        if (!res.ok) {
            setStatus(data.error || 'Save failed', 'text-danger');
            return;
        }

        savedRouteId = data.id;
        setStatus('Route saved!', 'text-success');
        loadSavedRoutes();
    } catch (err) {
        setStatus('Save request failed', 'text-danger');
    }
}

// Download GPX file
async function downloadGpx() {
    const coords = snappedCoords.length ? snappedCoords : drawnPoints;

    if (!coords.length) {
        setStatus('No route to download', 'text-danger');
        return;
    }

    const name = document.getElementById('activityName').value.trim() || 'My Walk';
    const sportType = document.getElementById('sportType').value;
    const startTime = document.getElementById('startTime').value;

    const hours = parseInt(document.getElementById('durationHours').value) || 0;
    const minutes = parseInt(document.getElementById('durationMinutes').value) || 0;
    const seconds = parseInt(document.getElementById('durationSeconds').value) || 0;
    const durationSeconds = (hours * 3600) + (minutes * 60) + seconds;

    if (!startTime) {
        setStatus('Please enter a start date and time', 'text-danger');
        return;
    }

    if (durationSeconds <= 0) {
        setStatus('Please enter a duration greater than 0', 'text-danger');
        return;
    }

    setStatus('Generating GPX...', 'text-muted');

    try {
        const res = await fetch('/api/download/gpx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coordinates: coords,
                name,
                sport_type: sportType,
                start_time: new Date(startTime).toISOString(),
                duration_seconds: durationSeconds,
                distance_km: currentDistanceKm,
                route_id: savedRouteId
            })
        });

        if (!res.ok) {
            const err = await res.json();
            setStatus(err.error || 'Download failed', 'text-danger');
            return;
        }

        // Trigger file download
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/\s+/g, '_')}.gpx`;
        a.click();
        URL.revokeObjectURL(url);

        setStatus('GPX downloaded!', 'text-success');
    } catch (err) {
        setStatus('Download request failed', 'text-danger');
    }
}

// Load saved routes into sidebar list
async function loadSavedRoutes() {
    try {
        const res = await fetch('/api/activity/routes');
        const routes = await res.json();

        const list = document.getElementById('savedRoutesList');
        list.innerHTML = '';

        if (!routes.length) {
            list.innerHTML = '<p class="text-muted small">No saved routes yet.</p>';
            return;
        }

        routes.forEach(route => {
            const item = document.createElement('button');
            item.className = 'list-group-item list-group-item-action';
            item.innerHTML = `
                <div class="fw-bold">${route.name}</div>
                <small class="text-muted">${route.sport_type} · ${route.distance_km ? route.distance_km + ' km' : 'unknown distance'}</small>
            `;
            item.addEventListener('click', () => loadRoute(route.id));
            list.appendChild(item);
        });
    } catch (err) {
        console.error('Failed to load saved routes:', err);
    }
}

// Load a saved route onto the map
async function loadRoute(id) {
    try {
        const res = await fetch(`/api/activity/routes/${id}`);
        const route = await res.json();

        clearRoute();

        snappedCoords = route.coordinates;
        currentDistanceKm = parseFloat(route.distance_km);
        savedRouteId = route.id;

        routePolyline = L.polyline(snappedCoords, { color: '#fc4c02', weight: 4 }).addTo(map);
        map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });

        document.getElementById('activityName').value = route.name;
        document.getElementById('sportType').value = route.sport_type;
        const loadedMi = (currentDistanceKm * 0.621371).toFixed(2);
        document.getElementById('distanceDisplay').classList.remove('d-none');
        document.getElementById('distanceBadge').textContent = `${loadedMi} mi`;
        document.getElementById('distanceBadgeKm').textContent = `${currentDistanceKm.toFixed(2)} km`;
        document.getElementById('activityForm').classList.remove('d-none');

        setStatus(`Loaded: ${route.name}`, 'text-success');
    } catch (err) {
        setStatus('Failed to load route', 'text-danger');
    }
}

// Upload activity directly to Strava
async function uploadToStrava() {
    const coords = snappedCoords.length ? snappedCoords : drawnPoints;

    if (!coords.length) {
        setStatus('No route to upload', 'text-danger');
        return;
    }

    const name = document.getElementById('activityName').value.trim() || 'My Walk';
    const sportType = document.getElementById('sportType').value;
    const startTime = document.getElementById('startTime').value;

    const hours = parseInt(document.getElementById('durationHours').value) || 0;
    const minutes = parseInt(document.getElementById('durationMinutes').value) || 0;
    const seconds = parseInt(document.getElementById('durationSeconds').value) || 0;
    const durationSeconds = (hours * 3600) + (minutes * 60) + seconds;

    if (!startTime) {
        setStatus('Please enter a start date and time', 'text-danger');
        return;
    }

    if (durationSeconds <= 0) {
        setStatus('Please enter a duration greater than 0', 'text-danger');
        return;
    }

    setStatus('Uploading to Strava...', 'text-muted');
    document.getElementById('uploadStravaBtn').disabled = true;

    try {
        const res = await fetch('/api/download/upload-strava', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coordinates: coords,
                name,
                sport_type: sportType,
                start_time: new Date(startTime).toISOString(),
                duration_seconds: durationSeconds,
                distance_km: currentDistanceKm,
                route_id: savedRouteId
            })
        });

        const data = await res.json();

        if (!res.ok) {
            setStatus(data.error || 'Upload failed', 'text-danger');
            document.getElementById('uploadStravaBtn').disabled = false;
            return;
        }

        if (data.strava_url) {
            setStatus('Uploaded! Opening activity...', 'text-success');
            window.open(data.strava_url, '_blank');
        } else {
            setStatus('Uploaded to Strava (still processing)', 'text-success');
        }
    } catch (err) {
        setStatus('Upload request failed', 'text-danger');
    }

    document.getElementById('uploadStravaBtn').disabled = false;
}

// Check Strava connection status and update UI
async function checkStravaStatus() {
    try {
        const res = await fetch('/auth/status');
        const data = await res.json();

        if (data.connected) {
            document.getElementById('stravaConnected').classList.remove('d-none');
            document.getElementById('stravaDisconnected').classList.add('d-none');
            document.getElementById('uploadStravaBtn').classList.remove('d-none');
        } else {
            document.getElementById('stravaConnected').classList.add('d-none');
            document.getElementById('stravaDisconnected').classList.remove('d-none');
            document.getElementById('uploadStravaBtn').classList.add('d-none');
        }
    } catch (err) {
        console.error('Failed to check Strava status:', err);
    }
}

function setStatus(msg, cssClass) {
    const el = document.getElementById('statusMsg');
    el.className = cssClass;
    el.textContent = msg;
}

// Wire up buttons
document.getElementById('searchBtn').addEventListener('click', searchLocation);
document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchLocation();
});
document.getElementById('snapBtn').addEventListener('click', snapToRoads);
document.getElementById('clearBtn').addEventListener('click', clearRoute);
document.getElementById('saveRouteBtn').addEventListener('click', saveRoute);
document.getElementById('downloadBtn').addEventListener('click', downloadGpx);
document.getElementById('uploadStravaBtn').addEventListener('click', uploadToStrava);
document.getElementById('disconnectBtn').addEventListener('click', async () => {
    await fetch('/auth/disconnect', { method: 'POST' });
    checkStravaStatus();
});

// Set default start time to now
const now = new Date();
now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
document.getElementById('startTime').value = now.toISOString().slice(0, 16);

// Boot
initMap();
loadSavedRoutes();
checkStravaStatus();
