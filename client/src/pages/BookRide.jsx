import { useEffect, useRef, useState } from 'react';
import RideMap from '../components/RideMap';
import ErrorMessage from '../components/ErrorMessage';
import api from '../services/api';
import { calculateEstimatedFare, calculateStraightLineDistance, cabOptions } from '../utils/fareCalculator';

const defaultPickup = { address: 'Connaught Place, New Delhi', latitude: 28.6304, longitude: 77.2167 };
const defaultDropoff = { address: 'India Gate, New Delhi', latitude: 28.6129, longitude: 77.2295 };
const RIDER_LOCATION_KEY = 'ridego_rider_location';
const SAVED_PLACES_KEY = 'ridego_saved_places';

const readLocation = (key) => {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const readSavedPlaces = () => {
  try {
    const stored = localStorage.getItem(SAVED_PLACES_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    return {
      home: parsed.home || '',
      work: parsed.work || '',
    };
  } catch (error) {
    return { home: '', work: '' };
  }
};

const resolveLocationLabel = async ({ latitude, longitude }, fallbackLabel) => {
  try {
    const response = await api.get('/geo/reverse', {
      params: {
        lat: latitude,
        lon: longitude,
      },
    });

    const data = response?.data?.result;
    if (!data?.display_name) {
      return fallbackLabel;
    }

    const shortName = data.display_name.split(',').slice(0, 3).join(',').trim();
    return shortName || fallbackLabel;
  } catch (error) {
    return fallbackLabel;
  }
};

const BookRide = () => {
  const [pickup, setPickup] = useState(defaultPickup);
  const [dropoff, setDropoff] = useState(defaultDropoff);
  const [selectedPoint, setSelectedPoint] = useState('pickup');
  const [cabType, setCabType] = useState('Mini');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [searchingPlace, setSearchingPlace] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState({ pickup: [], dropoff: [] });
  const suggestionTimers = useRef({ pickup: null, dropoff: null });
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Hi! I can suggest a cab, a weather-aware departure window, and explain your fare based on the live conditions near your pickup.' },
  ]);
  const [liveRiderLocation, setLiveRiderLocation] = useState(() => readLocation(RIDER_LOCATION_KEY));
  const [savedPlaces, setSavedPlaces] = useState(() => readSavedPlaces());
  const [createdRide, setCreatedRide] = useState(null);

  useEffect(() => {
    let active = true;
    setQuote(null);
    setQuoteLoading(true);
    api.post('/rides/quote', { pickup, dropoff })
      .then((response) => {
        if (active) setQuote(response.data.quote);
      })
      .catch(() => {
        if (active) setQuote(null);
      })
      .finally(() => {
        if (active) setQuoteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === RIDER_LOCATION_KEY) {
        setLiveRiderLocation(readLocation(RIDER_LOCATION_KEY));
      }

      if (event.key === SAVED_PLACES_KEY) {
        setSavedPlaces(readSavedPlaces());
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      Object.values(suggestionTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const applySavedAddress = (placeKey) => {
    const nextAddress = savedPlaces[placeKey];
    if (!nextAddress) return;

    if (selectedPoint === 'pickup') {
      setPickup((current) => ({ ...current, address: nextAddress }));
      return;
    }

    setDropoff((current) => ({ ...current, address: nextAddress }));
  };

  const fetchPlaceSuggestions = async (target, rawQuery) => {
    const query = (rawQuery || '').trim();
    if (query.length < 2) {
      setPlaceSuggestions((current) => ({ ...current, [target]: [] }));
      return;
    }

    try {
      const response = await api.get('/geo/search', {
        params: {
          q: query,
          limit: 5,
        },
      });

      const results = response?.data?.results || [];
      setPlaceSuggestions((current) => ({ ...current, [target]: Array.isArray(results) ? results : [] }));
    } catch (error) {
      setPlaceSuggestions((current) => ({ ...current, [target]: [] }));
    }
  };

  const schedulePlaceSuggestions = (target, query) => {
    if (suggestionTimers.current[target]) {
      clearTimeout(suggestionTimers.current[target]);
    }

    suggestionTimers.current[target] = setTimeout(() => {
      fetchPlaceSuggestions(target, query);
    }, 500);
  };

  const geocodePlace = async (target, rawQuery) => {
    const query = (rawQuery || '').trim();
    if (!query) {
      setError('Please enter a pickup or destination place before searching.');
      return;
    }

    setSearchingPlace(target);
    setError('');
    setPlaceSuggestions((current) => ({ ...current, [target]: [] }));

    try {
      const response = await api.get('/geo/search', {
        params: {
          q: query,
          limit: 1,
        },
      });

      const results = response?.data?.results || [];
      const result = results?.[0];

      if (!result && response?.data?.message) {
        throw new Error(response.data.message);
      }

      if (!result) {
        throw new Error('No matching location found. Try a more specific place name.');
      }

      const nextCoords = {
        latitude: Number(result.lat),
        longitude: Number(result.lon),
      };

      const resolvedAddress = result.display_name || query;

      if (target === 'pickup') {
        setPickup({ ...nextCoords, address: resolvedAddress });
        setSelectedPoint('dropoff');
      } else {
        setDropoff({ ...nextCoords, address: resolvedAddress });
        setSelectedPoint('pickup');
      }

      setMessage(`Location found: ${resolvedAddress}. Fare will update based on this exact destination.`);
    } catch (err) {
      setError(err.message || 'Unable to find the selected location.');
    } finally {
      setSearchingPlace('');
    }
  };

  const handlePickup = async (coords) => {
    const nextAddress = await resolveLocationLabel(coords, `Lat ${coords.latitude.toFixed(3)}, Lng ${coords.longitude.toFixed(3)}`);
    const nextPickup = { ...coords, address: nextAddress };
    setPickup(nextPickup);
    setSelectedPoint('dropoff');
  };

  const handleDropoff = async (coords) => {
    const nextAddress = await resolveLocationLabel(coords, `Lat ${coords.latitude.toFixed(3)}, Lng ${coords.longitude.toFixed(3)}`);
    const nextDropoff = { ...coords, address: nextAddress };
    setDropoff(nextDropoff);
    setSelectedPoint('pickup');
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      setError('Browser location access is not available.');
      return;
    }

    setShareLoading(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          updatedAt: new Date().toISOString(),
        };

        const livePickupLabel = await resolveLocationLabel(nextLocation, 'Shared live pickup location');

        localStorage.setItem(RIDER_LOCATION_KEY, JSON.stringify(nextLocation));
        setLiveRiderLocation(nextLocation);
        setPickup({
          ...nextLocation,
          address: livePickupLabel,
        });
        setSelectedPoint('dropoff');
        setMessage('Live rider location shared successfully.');
        setShareLoading(false);
      },
      () => {
        setError('Please allow location access so the driver can track your live position.');
        setShareLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleCreateRide = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        pickup: { ...pickup, latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) },
        dropoff: { ...dropoff, latitude: Number(dropoff.latitude), longitude: Number(dropoff.longitude) },
        cabType,
      };

      const response = await api.post('/rides', payload);
      const bookedRide = response.data.ride;
      setCreatedRide(bookedRide);
      setMessage(`${response.data.message || 'Booking confirmed.'} Final fare: ₹${Number(bookedRide.fare).toFixed(2)}.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create booking right now.');
    } finally {
      setLoading(false);
    }
  };

  const distance = calculateStraightLineDistance(pickup, dropoff);
  const currentFare = quote?.fares.find((fareOption) => fareOption.cabType === cabType);
  const fare = currentFare?.fare ?? calculateEstimatedFare(pickup, dropoff, cabType);

  const answerQuestion = (question) => {
    const normalized = question.toLowerCase();
    const weather = quote?.weather;
    const locationLabel = pickup.address || 'your pickup location';
    const tripSummary = weather?.tripSummary || `${locationLabel} conditions are being reviewed. The final fare and recommendation follow the live weather forecast.`;
    let answer;

    if (/vehicle|vechile|cab|car|gadi|gaadi|kaunsi|konsi|kon sa|kon si|book kar|book kru|recommend|suggest/.test(normalized)) {
      const recommendedFare = quote?.fares.find((fareOption) => fareOption.cabType === weather?.suggestedVehicle)?.fare;
      answer = weather
        ? `${tripSummary} ${weather.recommendation} Suggested ${weather.suggestedVehicle}${recommendedFare ? ` fare: ₹${recommendedFare.toFixed(2)}` : ''}.`
        : 'I could not load the weather forecast. Mini is the lowest fare; choose Sedan or SUV for more space.';
    } else if (/when|time|kab|samay|jana|leave|depart/.test(normalized)) {
      answer = weather
        ? `${tripSummary} ${weather.departureAdvice}`
        : 'Check the local forecast before leaving. I could not load a live weather forecast right now.';
    } else if (/fare|price|cost|kitna|kiraya|charge/.test(normalized)) {
      answer = quote
        ? `${tripSummary} Weather adjustment: ${weather.multiplier === 1 ? 'no change' : `${Math.round((weather.multiplier - 1) * 100)}%`}. ${quote.fares.map((option) => `${option.cabType} ₹${option.fare.toFixed(2)}`).join(' · ')}. Final fare is recalculated when you book.`
        : 'Fare quote is loading; the standard estimate is shown for now.';
    } else {
      answer = weather
        ? `${tripSummary} Ask me about vehicle, timing, or fare.`
        : 'I can help with cab choice, departure time, and fare. The live forecast is currently unavailable.';
    }

    setChatMessages((messages) => [
      ...messages,
      { role: 'user', text: question },
      { role: 'assistant', text: answer },
    ]);
    setChatInput('');
  };

  const handleChatSubmit = (event) => {
    event.preventDefault();
    const question = chatInput.trim();
    if (question) answerQuestion(question);
  };

  return (
    <div className="page-shell">
      <div className="container booking-layout">
        <div className="panel">
          <h2>Book a ride</h2>

          <div className="booking-controls">
            <button className="btn btn-light" onClick={() => setSelectedPoint('pickup')}>
              Select pickup
            </button>
            <button className="btn btn-light" onClick={() => setSelectedPoint('dropoff')}>
              Select drop-off
            </button>
            <button className="btn btn-primary" onClick={handleShareLocation} disabled={shareLoading}>
              {shareLoading ? 'Sharing...' : 'Share live location'}
            </button>
          </div>

          {liveRiderLocation && (
            <div className="live-location-box">
              <strong>Live rider location:</strong> {liveRiderLocation.latitude.toFixed(4)}, {liveRiderLocation.longitude.toFixed(4)}
            </div>
          )}

          {(savedPlaces.home || savedPlaces.work) && (
            <div className="panel" style={{ marginBottom: '18px', padding: '16px', background: '#f7faf3' }}>
              <p className="eyebrow" style={{ margin: '0 0 10px' }}>Saved places</p>
              <div className="inline-buttons" style={{ justifyContent: 'flex-start' }}>
                {savedPlaces.home && (
                  <button type="button" className="btn btn-light" onClick={() => applySavedAddress('home')}>
                    Use Home
                  </button>
                )}
                {savedPlaces.work && (
                  <button type="button" className="btn btn-light" onClick={() => applySavedAddress('work')}>
                    Use Work
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="form-grid location-fields">
            <div>
              <label htmlFor="pickup-address">
                Pickup label
                <input
                  id="pickup-address"
                  value={pickup.address}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setPickup({ ...pickup, address: nextValue });
                    schedulePlaceSuggestions('pickup', nextValue);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      geocodePlace('pickup', pickup.address);
                    }
                  }}
                  required
                />
                {placeSuggestions.pickup.length > 0 && (
                  <div className="suggestion-list" style={{ marginTop: '8px' }}>
                    {placeSuggestions.pickup.map((suggestion) => (
                      <button
                        key={`${suggestion.place_id}-${suggestion.display_name}`}
                        type="button"
                        className="btn btn-light suggestion-item"
                        style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: '6px' }}
                        onClick={() => {
                          const nextCoords = {
                            latitude: Number(suggestion.lat),
                            longitude: Number(suggestion.lon),
                          };
                          setPickup({ ...nextCoords, address: suggestion.display_name });
                          setPlaceSuggestions((current) => ({ ...current, pickup: [] }));
                          setSelectedPoint('dropoff');
                          setMessage(`Pickup set to ${suggestion.display_name}. Fare is recalculating.`);
                        }}
                      >
                        {suggestion.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => geocodePlace('pickup', pickup.address)}
                  disabled={searchingPlace === 'pickup'}
                >
                  {searchingPlace === 'pickup' ? 'Searching...' : 'Search pickup'}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="dropoff-address">
                Destination label
                <input
                  id="dropoff-address"
                  value={dropoff.address}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setDropoff({ ...dropoff, address: nextValue });
                    schedulePlaceSuggestions('dropoff', nextValue);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      geocodePlace('dropoff', dropoff.address);
                    }
                  }}
                  required
                />
                {placeSuggestions.dropoff.length > 0 && (
                  <div className="suggestion-list" style={{ marginTop: '8px' }}>
                    {placeSuggestions.dropoff.map((suggestion) => (
                      <button
                        key={`${suggestion.place_id}-${suggestion.display_name}`}
                        type="button"
                        className="btn btn-light suggestion-item"
                        style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: '6px' }}
                        onClick={() => {
                          const nextCoords = {
                            latitude: Number(suggestion.lat),
                            longitude: Number(suggestion.lon),
                          };
                          setDropoff({ ...nextCoords, address: suggestion.display_name });
                          setPlaceSuggestions((current) => ({ ...current, dropoff: [] }));
                          setSelectedPoint('pickup');
                          setMessage(`Destination set to ${suggestion.display_name}. Fare is recalculating.`);
                        }}
                      >
                        {suggestion.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => geocodePlace('dropoff', dropoff.address)}
                  disabled={searchingPlace === 'dropoff'}
                >
                  {searchingPlace === 'dropoff' ? 'Searching...' : 'Search destination'}
                </button>
              </div>
            </div>
          </div>

          <fieldset className="cab-picker">
            <legend>Choose a cab</legend>
            <div className="cab-options">
              {cabOptions.map((option) => {
                const optionFare = calculateEstimatedFare(pickup, dropoff, option.name);

                return (
                  <button
                    key={option.name}
                    type="button"
                    className={`cab-option ${cabType === option.name ? 'selected' : ''}`}
                    aria-pressed={cabType === option.name}
                    onClick={() => setCabType(option.name)}
                  >
                    <span className="vehicle-icon" aria-hidden="true" />
                    <span className="cab-copy">
                      <strong>{option.name}</strong>
                      <small>{option.description}</small>
                    </span>
                    <strong className="cab-price">₹{(quote?.fares.find((fareOption) => fareOption.cabType === option.name)?.fare ?? optionFare).toFixed(2)}</strong>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="summary-box">
            <p>Estimated straight-line distance: {distance.toFixed(2)} km</p>
            <p>Estimated {cabType} fare: ₹{fare.toFixed(2)}{quoteLoading ? ' · Updating weather quote...' : ''}</p>
            {quote && (
              <p className="weather-quote-note">
                {quote.weather.condition}{quote.weather.temperatureC !== null ? ` · ${quote.weather.temperatureC}°C` : ''}
                {quote.fares.find((fareOption) => fareOption.cabType === cabType)?.weatherAdjustment > 0
                  ? ` · Weather adjustment +₹${quote.fares.find((fareOption) => fareOption.cabType === cabType).weatherAdjustment.toFixed(2)}`
                  : ' · Standard weather rate'}
              </p>
            )}
          </div>

          <section className="weather-chat" aria-label="Weather trip assistant">
            <div className="weather-chat-heading">
              <div>
                <p className="eyebrow">AI trip assistant</p>
                <h3>Weather-aware ride help</h3>
              </div>
              <span className={`weather-status ${quote?.weather.available ? 'is-live' : ''}`}>
                {quoteLoading ? 'Checking forecast' : quote?.weather.available ? quote.weather.condition : 'Forecast fallback'}
              </span>
            </div>
            {quote && <p className="weather-advice">{quote.weather.tripSummary || quote.weather.departureAdvice}</p>}
            <div className="chat-transcript" aria-live="polite">
              {chatMessages.map((chatMessage, index) => (
                <p className={`chat-message ${chatMessage.role}`} key={`${chatMessage.role}-${index}`}>
                  {chatMessage.text}
                </p>
              ))}
            </div>
            <div className="chat-prompts">
              <button type="button" className="btn btn-light" onClick={() => answerQuestion('Which vehicle do you recommend?')}>Suggest vehicle</button>
              <button type="button" className="btn btn-light" onClick={() => answerQuestion('When should I leave?')}>Best time</button>
              <button type="button" className="btn btn-light" onClick={() => answerQuestion('How is my fare calculated?')}>Explain fare</button>
            </div>
            <form className="chat-input-row" onSubmit={handleChatSubmit}>
              <input
                aria-label="Ask the trip assistant"
                placeholder="Ask about cab, timing, or fare"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={!chatInput.trim()}>Ask</button>
            </form>
          </section>

          <button className="btn btn-primary" onClick={handleCreateRide} disabled={loading || quoteLoading}>
            {loading ? 'Booking...' : quoteLoading ? 'Updating fare...' : 'Confirm booking'}
          </button>

          {createdRide && (
            <div className="success-box" style={{ marginTop: '18px' }}>
              <p className="eyebrow" style={{ margin: '0 0 8px' }}>Ride confirmed</p>
              <h3 style={{ margin: '0 0 10px' }}>Trip summary</h3>
              <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
                <div><strong>Ride ID:</strong> {createdRide._id}</div>
                <div><strong>Pickup:</strong> {createdRide.pickup.address}</div>
                <div><strong>Dropoff:</strong> {createdRide.dropoff.address}</div>
                <div><strong>Cab:</strong> {createdRide.cabType}</div>
                <div><strong>Fare:</strong> ₹{Number(createdRide.fare).toFixed(2)}</div>
                <div><strong>Status:</strong> {createdRide.status}</div>
              </div>
              <div className="inline-buttons">
                <button type="button" className="btn btn-light" onClick={() => setCreatedRide(null)}>
                  Book another ride
                </button>
                <a className="btn btn-primary" href="/my-rides">
                  View my rides
                </a>
              </div>
            </div>
          )}

          <ErrorMessage message={error} />
          {message && <div className="success-box">{message}</div>}
        </div>

        <div className="panel map-panel">
          <RideMap
            pickup={pickup}
            dropoff={dropoff}
            riderLocation={liveRiderLocation}
            onPickupSelect={handlePickup}
            onDropoffSelect={handleDropoff}
            selectedPoint={selectedPoint}
          />
        </div>
      </div>
    </div>
  );
};

export default BookRide;
