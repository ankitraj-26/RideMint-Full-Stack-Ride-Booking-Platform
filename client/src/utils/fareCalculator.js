export const cabOptions = [
  { name: 'Mini', baseFare: 40, ratePerKm: 12, description: 'Budget-friendly city rides' },
  { name: 'Sedan', baseFare: 60, ratePerKm: 16, description: 'Comfortable rides for regular trips' },
  { name: 'SUV', baseFare: 90, ratePerKm: 21, description: 'Spacious trips for families or luggage' },
];

export const calculateStraightLineDistance = (pickup, dropoff) => {
  if (!pickup || !dropoff) return 0;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(dropoff.latitude - pickup.latitude);
  const dLng = toRad(dropoff.longitude - pickup.longitude);
  const lat1 = toRad(pickup.latitude);
  const lat2 = toRad(dropoff.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(2));
};

export const calculateEstimatedFare = (pickup, dropoff, cabType) => {
  const option = cabOptions.find((ride) => ride.name === cabType);
  if (!pickup || !dropoff || !option) return 0;

  const distance = calculateStraightLineDistance(pickup, dropoff);
  const fare = option.baseFare + distance * option.ratePerKm;
  return Number(fare.toFixed(2));
};
