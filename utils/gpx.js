// Builds a GPX XML string from route coordinates and activity details
function buildGpx(coords, details) {
    const { name, sportType, startTime, durationSeconds } = details;

    const totalPoints = coords.length;
    const msPerPoint = (durationSeconds * 1000) / Math.max(totalPoints - 1, 1);

    const start = new Date(startTime);

    const trackPoints = coords.map((coord, i) => {
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
