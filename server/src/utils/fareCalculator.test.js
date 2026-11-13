import { describe, expect, it } from 'vitest';
import { calculateDistanceKm, calculateFare } from './fareCalculator.js';
import { buildWeatherGuidance, createWeatherQuote, describeWeather } from './weatherAssistant.js';

describe('Fare calculator', () => {
  it('calculates straight-line distance correctly', () => {
    const distance = calculateDistanceKm({
      latitude1: 28.6139,
      longitude1: 77.209,
      latitude2: 28.6129,
      longitude2: 77.2295,
    });

    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeCloseTo(2, 1);
  });

  it('calculates fare using the cab rate rules', () => {
    const fare = calculateFare({
      latitude1: 28.6139,
      longitude1: 77.209,
      latitude2: 28.6129,
      longitude2: 77.2295,
      cabType: 'Mini',
    });

    expect(fare).toBeGreaterThan(0);
    expect(fare).toBeCloseTo(64, 1);
  });

  it('accepts valid longitudes outside the latitude range', () => {
    const distance = calculateDistanceKm({
      latitude1: 0,
      longitude1: 120,
      latitude2: 0,
      longitude2: 121,
    });

    expect(distance).toBeGreaterThan(0);
  });

  it('rejects longitudes outside the geographic range', () => {
    expect(() =>
      calculateDistanceKm({
        latitude1: 0,
        longitude1: 181,
        latitude2: 0,
        longitude2: 0,
      })
    ).toThrow('Pickup longitude must be between -180 and 180.');
  });

  it('adjusts each cab fare consistently for weather and leaves clear-weather fares unchanged', () => {
    const trip = {
      pickup: { latitude: 28.6304, longitude: 77.2167 },
      dropoff: { latitude: 28.6129, longitude: 77.2295 },
    };
    const clearQuote = createWeatherQuote({ ...trip, weather: { multiplier: 1 } });
    const rainQuote = createWeatherQuote({ ...trip, weather: { multiplier: 1.12 } });

    expect(clearQuote.fares[0].weatherAdjustment).toBe(0);
    expect(rainQuote.fares[0].fare).toBeGreaterThan(clearQuote.fares[0].fare);
    expect(rainQuote.fares[0].fare).toBeCloseTo(clearQuote.fares[0].fare * 1.12, 2);
    expect(rainQuote.fares.map((fare) => fare.cabType)).toEqual(['Mini', 'Sedan', 'SUV']);
  });

  it('recommends an enclosed cab in rain and an SUV in thunderstorms', () => {
    expect(describeWeather(63)).toMatchObject({ condition: 'Rain', multiplier: 1.12, vehicle: 'Sedan' });
    expect(describeWeather(95)).toMatchObject({ condition: 'Thunderstorm', multiplier: 1.2, vehicle: 'SUV' });
    expect(describeWeather(0).multiplier).toBe(1);
  });

  it('builds a location-aware trip summary that ties weather, timing, and vehicle choice together', () => {
    const summary = buildWeatherGuidance(
      {
        condition: 'Rain',
        suggestedVehicle: 'Sedan',
        recommendation: 'Rain is forecast; choose a comfortable enclosed ride.',
        departureAdvice: 'Leave 15 minutes early because rain may affect the next few hours.',
        multiplier: 1.12,
        temperatureC: 28,
        precipitationProbability: 72,
      },
      { pickupLabel: 'Connaught Place', distanceKm: 6.4 }
    );

    expect(summary).toContain('Rain');
    expect(summary).toContain('Sedan');
    expect(summary).toContain('Connaught Place');
    expect(summary).toContain('Leave 15 minutes early');
  });
});
