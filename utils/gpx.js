// Haversine distance in meters between two [lat, lon] points
function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat +
        Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sinLon * sinLon;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Builds a GPX XML string from route coordinates and activity details
function buildGpx(coords, details) {
    const { name, sportType, startTime, durationSeconds } = details;

    const start = new Date(startTime);

    // Calculate cumulative distances so time is proportional to distance,
    // keeping implied speed constant and preventing Strava from dropping segments
    const segmentDistances = [0];
    for (let i = 1; i < coords.length; i++) {
        segmentDistances.push(haversineMeters(coords[i - 1], coords[i]));
    }

    const totalDistance = segmentDistances.reduce((sum, d) => sum + d, 0);

    const cumulativeDistances = segmentDistances.reduce((acc, d) => {
        acc.push((acc[acc.length - 1] || 0) + d);
        return acc;
    }, []);

    const trackPoints = coords.map((coord, i) => {
        const fraction = totalDistance > 0 ? cumulativeDistances[i] / totalDistance : i / Math.max(coords.length - 1, 1);
        const pointTime = new Date(start.getTime() + fraction * durationSeconds * 1000);
        return `        <trkpt lat="${coord[0]}" lon="${coord[1]}">
            <time>${pointTime.toISOString()}</time>
        </trkpt>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava Walk Generator"
    xmlns="http://www.topografix.com/GPX/1/1"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.topografix.com/GPX/1/1
        http://www.topografix.com/GPX/1/1/gpx.xsd">
    <metadata>
        <name>${escapeXml(name)}</name>
        <time>${start.toISOString()}</time>
    </metadata>
    <trk>
        <name>${escapeXml(name)}</name>
        <type>${escapeXml(sportType)}</type>
        <trkseg>
${trackPoints}
        </trkseg>
    </trk>
</gpx>`;
}

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

module.exports = { buildGpx };
