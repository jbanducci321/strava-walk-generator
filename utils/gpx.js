const METERS_PER_MILE = 1609.344;

function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Interpolate a coordinate between two points at a given fraction
function interpolate(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Return coords at the start, each exact mile marker, and the end
function getMileMarkerCoords(coords) {
    const cumulative = [0];
    for (let i = 1; i < coords.length; i++) {
        cumulative.push(cumulative[i - 1] + haversineMeters(coords[i - 1], coords[i]));
    }
    const totalMeters = cumulative[cumulative.length - 1];

    const points = [coords[0]];
    let mile = 1;

    while (mile * METERS_PER_MILE < totalMeters) {
        const targetMeters = mile * METERS_PER_MILE;

        // Find the segment that contains this distance
        let segIdx = cumulative.findIndex(d => d >= targetMeters) - 1;
        if (segIdx < 0) segIdx = 0;

        const segStart = cumulative[segIdx];
        const segEnd = cumulative[segIdx + 1];
        const t = (targetMeters - segStart) / (segEnd - segStart);

        points.push(interpolate(coords[segIdx], coords[segIdx + 1], t));
        mile++;
    }

    points.push(coords[coords.length - 1]);
    return points;
}

// Builds a GPX XML string from route coordinates and activity details
function buildGpx(coords, details) {
    const { name, sportType, startTime, durationSeconds } = details;

    const start = new Date(startTime);

    // Place track points at each mile marker so Strava's splits match exactly
    const milePoints = getMileMarkerCoords(coords);
    const msPerPoint = (durationSeconds * 1000) / (milePoints.length - 1);

    const trackPoints = milePoints.map((coord, i) => {
        const pointTime = new Date(start.getTime() + i * msPerPoint);
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
