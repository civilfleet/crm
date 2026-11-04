const alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohash(latitude: number, longitude: number, precision = 3) {
  const lat = [-90, 90];
  const lon = [-180, 180];
  let result = "";
  let bits = 0;
  let value = 0;
  let even = true;
  while (result.length < precision) {
    const range = even ? lon : lat;
    const coordinate = even ? longitude : latitude;
    const middle = (range[0] + range[1]) / 2;
    value = (value << 1) | Number(coordinate >= middle);
    range[coordinate >= middle ? 0 : 1] = middle;
    even = !even;
    if (++bits === 5) {
      result += alphabet[value];
      bits = 0;
      value = 0;
    }
  }
  return result;
}

export function geohashBounds(hash: string): [number, number, number, number] {
  const lat = [-90, 90];
  const lon = [-180, 180];
  let even = true;
  for (const char of hash) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("Invalid geohash");
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lon : lat;
      range[(value >> bit) & 1 ? 0 : 1] = (range[0] + range[1]) / 2;
      even = !even;
    }
  }
  return [lat[0], lon[0], lat[1], lon[1]];
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const a =
    Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

// Conservative spherical cap bounds: include every intersecting cell, even at
// the antimeridian or poles. Exact distance is checked after fetching a shard.
export function intersectsRadius(
  bounds: [number, number, number, number],
  latitude: number,
  longitude: number,
  radius: number,
) {
  const angle = radius / 6371.0088;
  const latDelta = (angle * 180) / Math.PI;
  if (bounds[2] < latitude - latDelta || bounds[0] > latitude + latDelta)
    return false;
  if (
    latitude + latDelta >= 90 ||
    latitude - latDelta <= -90 ||
    angle >= Math.PI
  )
    return true;
  const lonDelta =
    (Math.asin(Math.min(1, Math.sin(angle) / Math.cos(radians(latitude)))) *
      180) /
    Math.PI;
  return [-360, 0, 360].some(
    (shift) =>
      bounds[3] + shift >= longitude - lonDelta &&
      bounds[1] + shift <= longitude + lonDelta,
  );
}
