import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const LocationPicker = ({ pointType, onSelect }) => {
  useMapEvents({
    click(e) {
      onSelect({ latitude: e.latlng.lat, longitude: e.latlng.lng, label: `${pointType} selected` });
    },
  });

  return null;
};

const RideMap = ({ pickup, dropoff, riderLocation, driverLocation, onPickupSelect, onDropoffSelect, selectedPoint }) => {
  const defaultCenter = [28.6139, 77.209];
  const center = pickup
    ? [pickup.latitude, pickup.longitude]
    : riderLocation
      ? [riderLocation.latitude, riderLocation.longitude]
      : driverLocation
        ? [driverLocation.latitude, driverLocation.longitude]
        : defaultCenter;

  return (
    <div className="map-shell">
      <MapContainer center={center} zoom={11} scrollWheelZoom className="ride-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {pickup && (
          <Marker position={[pickup.latitude, pickup.longitude]}>
            <Popup>Pickup</Popup>
          </Marker>
        )}

        {dropoff && (
          <Marker position={[dropoff.latitude, dropoff.longitude]}>
            <Popup>Dropoff</Popup>
          </Marker>
        )}

        {riderLocation && (
          <Marker position={[riderLocation.latitude, riderLocation.longitude]}>
            <Popup>Rider live location</Popup>
          </Marker>
        )}

        {driverLocation && (
          <Marker position={[driverLocation.latitude, driverLocation.longitude]}>
            <Popup>Driver live location</Popup>
          </Marker>
        )}

        {selectedPoint === 'pickup' && <LocationPicker pointType="Pickup" onSelect={onPickupSelect} />}
        {selectedPoint === 'dropoff' && <LocationPicker pointType="Dropoff" onSelect={onDropoffSelect} />}
      </MapContainer>
    </div>
  );
};

export default RideMap;
