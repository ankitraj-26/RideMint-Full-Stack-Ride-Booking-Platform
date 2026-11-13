const nominatimHeaders = {
  Accept: 'application/json',
  'User-Agent': 'RideGo/1.0 (local-development)',
  Referer: process.env.CLIENT_URL || 'http://localhost:5173',
};

const fallbackLocations = {
  connaught: { display_name: 'Connaught Place, New Delhi, Delhi, India', lat: '28.6317695', lon: '77.2193804' },
  'india gate': { display_name: 'India Gate, New Delhi, Delhi, India', lat: '28.6129', lon: '77.2295' },
  delhi: { display_name: 'New Delhi, Delhi, India', lat: '28.6139', lon: '77.2090' },
  mumbai: { display_name: 'Mumbai, Maharashtra, India', lat: '19.0760', lon: '72.8777' },
  bangalore: { display_name: 'Bengaluru, Karnataka, India', lat: '12.9716', lon: '77.5946' },
  hyderabad: { display_name: 'Hyderabad, Telangana, India', lat: '17.3850', lon: '78.4867' },
  pune: { display_name: 'Pune, Maharashtra, India', lat: '18.5204', lon: '73.8567' },
  chandigarh: { display_name: 'Chandigarh, India', lat: '30.7333', lon: '76.7794' },
};

const findFallbackLocation = (query) => {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return null;

  const key = Object.keys(fallbackLocations).find((entry) => normalized.includes(entry) || entry.includes(normalized));
  return key ? { ...fallbackLocations[key], place_id: `fallback-${key}` } : null;
};

export const searchPlaces = async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query is required.' });
    }

    const limit = Number(req.query.limit || 5);
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 10) : 5;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', String(safeLimit));
    url.searchParams.set('q', query);

    const response = await fetch(url, {
      headers: nominatimHeaders,
    });

    if (!response.ok) {
      const fallback = findFallbackLocation(query);
      if (response.status === 429 && fallback) {
        return res.status(200).json({
          success: true,
          results: [fallback],
          message: 'Using a local fallback for this popular place while the map provider is rate-limiting requests.',
        });
      }

      return res.status(response.status).json({
        success: false,
        message: response.status === 429
          ? 'Search is temporarily rate-limited. Please wait a moment and try again.'
          : 'Location search failed. Please try another place name.',
      });
    }

    const results = await response.json();
    return res.status(200).json({ success: true, results: Array.isArray(results) ? results : [] });
  } catch (error) {
    return next(error);
  }
};

export const reverseGeocode = async (req, res, next) => {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ success: false, message: 'Valid latitude and longitude are required.' });
    }

    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));

    const response = await fetch(url, {
      headers: nominatimHeaders,
    });

    if (!response.ok) {
      const fallback = Object.values(fallbackLocations).find((entry) => {
        const latDiff = Math.abs(Number(entry.lat) - latitude);
        const lonDiff = Math.abs(Number(entry.lon) - longitude);
        return latDiff < 0.5 && lonDiff < 0.5;
      });

      if (response.status === 429 && fallback) {
        return res.status(200).json({
          success: true,
          result: {
            display_name: fallback.display_name,
            lat: fallback.lat,
            lon: fallback.lon,
          },
        });
      }

      return res.status(response.status).json({
        success: false,
        message: response.status === 429
          ? 'Reverse lookup is temporarily rate-limited. Please try again after a moment.'
          : 'Reverse geocoding failed.',
      });
    }

    const result = await response.json();
    return res.status(200).json({
      success: true,
      result: result || null,
    });
  } catch (error) {
    return next(error);
  }
};
