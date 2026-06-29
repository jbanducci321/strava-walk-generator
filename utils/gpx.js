function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function interpolateCoord(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Sample numPoints coords evenly spaced by distance along the route.
// This guarantees constant implied speed between every consecutive pair of
// points, so Strava sees no "stationary" segments to drop from moving time.
function sampleByDistance(coords, numPoints) {
    const cumDist = [0];
    for (let i = 1; i < coords.length; i++) {
        cumDist.push(cumDist[i - 1] + haversineMeters(coords[i - 1], coords[i]));
    }
    const totalDist = cumDist[cumDist.length - 1];

    if (totalDist === 0) {
        return coords.slice(0, numPoints);
    }

    const result = [];
    for (let i = 0; i < numPoints; i++) {
        const targetDist = (i / (numPoints - 1)) * totalDist;

        let segIdx = 0;
        while (segIdx < cumDist.length - 2 && cumDist[segIdx + 1] < targetDist) {
            segIdx++;
        }

        const segLen = cumDist[segIdx + 1] - cumDist[segIdx];
        const t = segLen > 0 ? (targetDist - cumDist[segIdx]) / segLen : 0;
        result.push(interpolateCoord(coords[segIdx], coords[segIdx + 1], t));
    }

    return result;
}

// Builds a GPX XML string from route coordinates and activity details
function buildGpx(coords, details) {
    const { name, sportType, startTime, durationSeconds } = details;

    const start = new Date(startTime);

    // 200 points evenly spaced by distance — constant implied speed throughout
    const sampled = sampleByDistance(coords, 200);
    const msPerPoint = (durationSeconds * 1000) / (sampled.length - 1);

    const trackPoints = sampled.map((coord, i) => {
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
