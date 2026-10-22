/** Decodes a Google encoded polyline into [lng, lat] pairs (GeoJSON coordinate order). */
export function decodePolyline(encoded: string, precision = 5): Array<[number, number]> {
  const factor = 10 ** precision;
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    lat += decodeSignedValue();
    lng += decodeSignedValue();
    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;

  function decodeSignedValue(): number {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
