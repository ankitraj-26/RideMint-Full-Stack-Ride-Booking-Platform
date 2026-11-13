import { calculateDistanceKm, cabRates } from './fareCalculator.js';

export const describeWeather = (code) => {
  if ([0].includes(code)) return { condition: 'Clear', multiplier: 1, vehicle: 'Mini', reason: 'Clear conditions suit any cab; Mini is the lowest fare.' };
  if ([1, 2, 3].includes(code)) return { condition: 'Partly cloudy', multiplier: 1, vehicle: 'Mini', reason: 'Conditions are mild; choose a cab based on your space and budget.' };
  if ([45, 48].includes(code)) return { condition: 'Fog', multiplier: 1.05, vehicle: 'Sedan', reason: 'Reduced visibility is expected; allow extra travel time and choose a comfortable enclosed cab.' };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { condition: 'Rain', multiplier: 1.12, vehicle: 'Sedan', reason: 'Rain is forecast; Sedan offers a comfortable enclosed ride. Leave extra time and check road conditions.' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { condition: 'Snow', multiplier: 1.18, vehicle: 'SUV', reason: 'Snow is forecast; SUV is the suggested option. Consider delaying travel if roads are unsafe.' };
  if ([95, 96, 99].includes(code)) return { condition: 'Thunderstorm', multiplier: 1.2, vehicle: 'SUV', reason: 'Thunderstorms are forecast; consider waiting for conditions to improve and check local safety alerts.' };
  return { condition: 'Variable conditions', multiplier: 1, vehicle: 'Mini', reason: 'Forecast conditions look manageable; choose based on your budget and passenger space.' };
};

const getUpcomingForecast = (times = [], probabilities = []) => {
  const now = Date.now();
  return times
    .map((time, index) => ({ time: new Date(time), probability: Number(probabilities[index] ?? 0) }))
    .filter(({ time }) => Number.isFinite(time.getTime()) && time.getTime() >= now && time.getTime() <= now + 6 * 60 * 60 * 1000);
};

const getBestDeparture = (candidates) => {
  if (!candidates.length) return null;
  return candidates.reduce((best, candidate) => candidate.probability < best.probability ? candidate : best);
};

export const buildWeatherGuidance = (weather = {}, context = {}) => {
  const pickupLabel = context.pickupLabel || 'your pickup location';
  const distanceKm = Number.isFinite(Number(context.distanceKm)) ? Number(context.distanceKm) : null;
  const condition = weather.condition || 'Weather';
  const vehicle = weather.suggestedVehicle || 'Mini';
  const departureAdvice = weather.departureAdvice || 'Check the local weather before leaving.';
  const recommendation = weather.recommendation || 'Choose a cab based on your budget and comfort.';
  const temperature = Number.isFinite(Number(weather.temperatureC)) ? `${Math.round(Number(weather.temperatureC))}°C` : 'current conditions';
  const rainChance = Number.isFinite(Number(weather.precipitationProbability))
    ? ` Rain chance is about ${Math.round(Number(weather.precipitationProbability))}% in the next few hours.`
    : '';
  const routeDistance = distanceKm !== null ? ` For this ${distanceKm.toFixed(1)} km trip, the fare reflects local weather conditions.` : '';

  return `At ${pickupLabel}, ${condition.toLowerCase()} conditions are expected with ${temperature}.${rainChance} ${recommendation} ${departureAdvice} Suggested vehicle: ${vehicle}.${routeDistance}`;
};

export const getWeatherContext = async ({ latitude, longitude }) => {
  if (process.env.NODE_ENV === 'test') {
    return {
      available: false,
      condition: 'Weather unavailable',
      weatherCode: null,
      temperatureC: null,
      precipitationMm: null,
      precipitationProbability: null,
      multiplier: 1,
      suggestedVehicle: 'Mini',
      recommendation: 'Test mode uses standard fare without requesting an external forecast.',
      suggestedDeparture: null,
      departureAdvice: 'Check your local weather before leaving.',
    };
  }

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'weather_code,temperature_2m,precipitation',
      hourly: 'precipitation_probability',
      forecast_days: '1',
      timezone: 'auto',
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) throw new Error(`Weather provider returned ${response.status}`);

    const data = await response.json();
    const code = Number(data.current?.weather_code);
    let description = describeWeather(code);
    const upcomingForecast = getUpcomingForecast(data.hourly?.time, data.hourly?.precipitation_probability);
    const bestDeparture = getBestDeparture(upcomingForecast);
    const peakPrecipitationProbability = upcomingForecast.length
      ? Math.max(...upcomingForecast.map(({ probability }) => probability))
      : null;
    if (peakPrecipitationProbability >= 60 && description.multiplier === 1) {
      description = {
        condition: 'Rain likely',
        multiplier: 1.08,
        vehicle: 'Sedan',
        reason: 'Rain is likely in the next few hours; Sedan is suggested for an enclosed ride. Allow extra travel time.',
      };
    }
    const departureAdvice = peakPrecipitationProbability !== null && peakPrecipitationProbability < 30
      ? 'Forecast is relatively dry for the next few hours; leaving now is reasonable.'
      : bestDeparture && bestDeparture.probability < 30
        ? `A drier window is around ${bestDeparture.time.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: data.timezone || 'UTC' })}.`
        : 'Rain may affect the next few hours; allow extra time and check local road conditions.';

    const enrichedWeather = {
      available: true,
      condition: description.condition,
      weatherCode: code,
      temperatureC: Number.isFinite(Number(data.current?.temperature_2m)) ? Number(data.current.temperature_2m) : null,
      precipitationMm: Number.isFinite(Number(data.current?.precipitation)) ? Number(data.current.precipitation) : null,
      precipitationProbability: bestDeparture?.probability ?? null,
      multiplier: description.multiplier,
      suggestedVehicle: description.vehicle,
      recommendation: description.reason,
      suggestedDeparture: bestDeparture ? bestDeparture.time.toISOString() : null,
      departureAdvice,
    };

    return {
      ...enrichedWeather,
      tripSummary: buildWeatherGuidance(enrichedWeather, { pickupLabel: 'your pickup location' }),
    };
  } catch (error) {
    const fallbackWeather = {
      available: false,
      condition: 'Weather unavailable',
      weatherCode: null,
      temperatureC: null,
      precipitationMm: null,
      precipitationProbability: null,
      multiplier: 1,
      suggestedVehicle: 'Mini',
      recommendation: 'Live forecast is unavailable. Showing the standard fare; choose a cab by budget and space.',
      suggestedDeparture: null,
      departureAdvice: 'Check your local weather before leaving.',
    };

    return {
      ...fallbackWeather,
      tripSummary: buildWeatherGuidance(fallbackWeather, { pickupLabel: 'your pickup location' }),
    };
  }
};

export const createWeatherQuote = ({ pickup, dropoff, weather }) => {
  const distanceKm = calculateDistanceKm({
    latitude1: pickup.latitude,
    longitude1: pickup.longitude,
    latitude2: dropoff.latitude,
    longitude2: dropoff.longitude,
  });
  const fareBreakdown = Object.entries(cabRates).map(([name, rates]) => {
    const baseFare = Number((rates.baseFare + distanceKm * rates.ratePerKm).toFixed(2));
    const fare = Number((baseFare * weather.multiplier).toFixed(2));
    return { cabType: name, baseFare, weatherAdjustment: Number((fare - baseFare).toFixed(2)), fare };
  });

  return {
    distanceKm,
    weather: {
      ...weather,
      tripSummary: buildWeatherGuidance(weather, { pickupLabel: pickup.address || 'your pickup location', distanceKm }),
    },
    fares: fareBreakdown,
  };
};