const CAB_RATES = {
  Mini: { baseFare: 40, ratePerKm: 12 },
  Sedan: { baseFare: 60, ratePerKm: 16 },
  SUV: { baseFare: 90, ratePerKm: 21 },
};

const toRadians = (degree) => (degree * Math.PI) / 180;

export const validCabTypes = ['Mini', 'Sedan', 'SUV'];
export const cabRates = CAB_RATES;

export const isValidCoordinate = (value, fieldName, min = -90, max = 90) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}.`);
  }
};

export const calculateDistanceKm = ({ latitude1, longitude1, latitude2, longitude2 }) => {
  isValidCoordinate(latitude1, 'Pickup latitude');
  isValidCoordinate(longitude1, 'Pickup longitude', -180, 180);
  isValidCoordinate(latitude2, 'Dropoff latitude');
  isValidCoordinate(longitude2, 'Dropoff longitude', -180, 180);

  const earthRadiusKm = 6371;
  const latDiff = toRadians(latitude2 - latitude1);
  const lngDiff = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(lngDiff / 2) *
      Math.sin(lngDiff / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(2));
};

export const calculateFare = ({ latitude1, longitude1, latitude2, longitude2, cabType, weatherMultiplier = 1 }) => {
  const normalizedCabType = cabType && cabType.trim();

  if (!CAB_RATES[normalizedCabType]) {
    throw new Error('Invalid cab type provided.');
  }

  const distanceKm = calculateDistanceKm({
    latitude1,
    longitude1,
    latitude2,
    longitude2,
  });

  const { baseFare, ratePerKm } = CAB_RATES[normalizedCabType];
  const totalFare = (baseFare + distanceKm * ratePerKm) * weatherMultiplier;

  return Number(totalFare.toFixed(2));
};
