/**
 * Bio-SentinelX — Geocoding & Location Intelligence Service
 *
 * Provides reverse geocoding to identify District and State from coordinates.
 */

export interface LocationInfo {
  district: string;
  state: string;
  city?: string;
  country: string;
}

/**
 * Reverse geocode coordinates to get District and State using Open-Meteo Geocoding API or OSM Nominatim.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<LocationInfo | null> {
  try {
    // OSM Nominatim provides better administrative boundary details for India
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BioSentinelX-Health-Intelligence-Platform'
      }
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.address) return null;

    // Mapping OSM address components to Indian context
    // District is often 'county', 'district', or 'state_district'
    const district = data.address.county || data.address.district || data.address.state_district || data.address.city || 'Unknown District';
    const state = data.address.state || 'Unknown State';
    const city = data.address.city || data.address.town || data.address.village;
    const country = data.address.country || 'India';

    return { district, state, city, country };
  } catch (err) {
    console.error('[GeoService] Reverse geocoding failed:', err);
    return null;
  }
}
