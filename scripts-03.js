// Import configuration and NLP module
import { processNaturalLanguage } from './nlp-secure.js';

// Initialize map variable to be defined after fetching the token
let map;

// Fetch the Mapbox token from the server securely
fetch('/api/config/mapbox')
  .then(response => response.json())
  .then(data => {
    // Set the Mapbox access token using the server's secure endpoint
    mapboxgl.accessToken = data.token;
    
    // Initialize Mapbox with the token
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-122.42136449, 37.80176523], // Center the map on San Francisco
      zoom: 8
    });

    map.on('load', () => {
      console.log('Map loaded');
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        }
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#00a0f0',
          'line-width': 3
        }
      });
      console.log('Layer added');
    });
  });



const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const loadingIndicator = document.getElementById('loading-indicator');

searchButton.addEventListener('click', async () => {
  const inputValue = searchInput.value;
  
  if (!inputValue.trim()) {
    alert('Please enter a search query');
    return;
  }
  
  // Show loading indicator
  loadingIndicator.style.display = 'block';
  
  try {
    // Process the natural language input
    const result = await processNaturalLanguage(inputValue);
    console.log('NLP Result:', result);
    
    if (result.locations && result.locations.length > 0) {
      // Process the extracted locations and preferences
      getRouteCoordinates(result.locations, result.preferences, true);
    } else {
      // Fallback to direct processing if NLP fails to extract locations
      getRouteCoordinates(inputValue);
    }
  } catch (error) {
    console.error('Error processing input:', error);
    // Fallback to direct processing
    getRouteCoordinates(inputValue);
  } finally {
    // Hide loading indicator
    loadingIndicator.style.display = 'none';
  }
});

// Updated to use our proxy endpoint instead of direct Mapbox API
const geocodingUrl = '/api/geocode/';

/**
 * Get route coordinates based on input and preferences
 * @param {string|Array} input - The input string or array of locations
 * @param {Object} preferences - Optional route preferences
 * @param {boolean} isLocationArray - Whether the input is already an array of locations
 */
function getRouteCoordinates(input, preferences = null, isLocationArray = false) {
  // Default preferences if not provided
  preferences = preferences || {
    transportMode: 'driving',
    avoidTolls: false,
    avoidHighways: false,
    avoidFerries: false
  };

  // Handle the input based on whether it's an array or string
  let locations;
  
  if (isLocationArray && Array.isArray(input)) {
    // If input is already an array of locations, use it directly
    console.log('Using provided locations array:', input);
    locations = input;
  } else {
    // Process the input string to extract locations
    // First, remove any trailing punctuation like periods
    let inputString = input.trim();
    inputString = inputString.replace(/[.!?]+$/, '').trim();
    
    console.log('Input after removing trailing punctuation:', inputString);
    
    // Improved location extraction logic
    
    // 1. Check if the input starts with "from" and remove it, but store this information
    const startsWithFrom = inputString.toLowerCase().startsWith('from ');
    if (startsWithFrom) {
      inputString = inputString.substring(5).trim();
    }
    
    // 2. Split by " to " to get all locations
    locations = inputString
      .split(/\s+to\s+/i)
      .map(location => location.trim())
      .filter(location => location.length > 0);
    
    // 3. Handle the case where we have a "from" prefix but only one location
    if (startsWithFrom && locations.length === 1) {
      console.log('Single location with "from" prefix detected');
    }
    
    // 4. Ensure we always treat the input as a route request when there are multiple locations
    // or when the input explicitly uses "to" or "from" keywords
    const hasToKeyword = input.toLowerCase().includes(' to ');
    const isRouteRequest = locations.length > 1 || startsWithFrom || hasToKeyword;
    
    // If this is not explicitly a route request and we have only one location,
    // we'll just center on that location
    if (!isRouteRequest && locations.length === 1) {
      console.log('Single location without route indicators detected');
    }
    
    console.log('Extracted locations:', locations);
    console.log('Is route request:', isRouteRequest);
  }

  if (!locations || locations.length < 1) {
    console.error('No valid locations found in input');
    alert('Please enter valid locations separated by "to"');
    return;
  }

  // Now we need to geocode each location using our proxy endpoint
  const geocodePromises = locations.map(location =>
    fetch(`${geocodingUrl}${encodeURIComponent(location)}`)
      .then(response => response.json())
      .then(data => {
        if (data.features && data.features.length > 0) {
          const coordinates = data.features[0].geometry.coordinates;
          return coordinates; // Return as array, not string
        } else {
          throw new Error(`Unable to geocode location: ${location}`);
        }
      })
  );

  Promise.all(geocodePromises)
    .then(coordinates => {
      console.log('Geocoded coordinates:', coordinates);
      console.log('Number of locations:', locations.length, 'Number of coordinates:', coordinates.length);
      
      // Determine if this should be treated as a route request or just centering on a location
      const startsWithFrom = input.toString().toLowerCase().trim().startsWith('from ');
      const hasToKeyword = input.toString().toLowerCase().includes(' to ');
      const isRouteRequest = coordinates.length > 1 || startsWithFrom || hasToKeyword;
      
      // Handle differently based on number of coordinates and whether it's a route request
      if (coordinates.length === 1 && !isRouteRequest) {
        // If there's only one location and it's not a route request, center the map on it
        const singleLocation = coordinates[0];  // Already an array [lng, lat]
        map.setCenter(singleLocation);
        map.setZoom(12);
        console.log('Single location:', singleLocation);

        // Clear the route data
        map.getSource('route').setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        });
        return;
      }
      
      // Ensure we have at least 2 coordinates for a valid route
      if (coordinates.length < 2) {
        console.error('Need at least 2 valid coordinates for a route');
        alert('Please provide at least two valid locations for a route');
        return;
      }
      
      // Make sure we're using all waypoints in multi-stop routes
      console.log('Processing multi-stop route with all waypoints:', locations);
      
      // Format coordinates string for our proxy endpoint
      const coordinatesString = coordinates
        .map(coord => coord.join(','))
        .join(';');
      
      // Build the exclude parameter for the query string if needed
      const avoidParams = [];
      if (preferences.avoidTolls) avoidParams.push('tolls');
      if (preferences.avoidHighways) avoidParams.push('highways');
      if (preferences.avoidFerries) avoidParams.push('ferries');
      
      // Construct the URL for our proxy endpoint
      let url = `/api/directions/${preferences.transportMode}/${coordinatesString}`;
      
      if (avoidParams.length > 0) {
        url += `?exclude=${avoidParams.join(',')}`;
      }

      console.log('Directions API URL:', url);

      // Fetch route from our proxy API
      fetch(url)
        .then(response => response.json())
        .then(data => {
          console.log('Route data:', data);
          if (data.routes && data.routes.length > 0) {
            const routeCoordinates = data.routes[0].geometry.coordinates;
            const mapData = {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: routeCoordinates
              }
            };
            
            // Update the map with the route data
            if (map.loaded() && map.getSource('route')) {
              map.getSource('route').setData(mapData);
              
              // Compute the bounding box for all coordinates
              const bounds = routeCoordinates.reduce((bounds, coord) => {
                return bounds.extend(coord);
              }, new mapboxgl.LngLatBounds(routeCoordinates[0], routeCoordinates[0]));

              // Fit the map to the bounds
              map.fitBounds(bounds, {
                padding: 50
              });
            } else {
              console.error('Map or source not ready');
            }
          } else {
            console.error('No valid route found in the API response');
            alert('Could not find a valid route between the specified locations');
          }
        })
        .catch(error => {
          console.error('Error fetching directions:', error);
          alert('Error getting directions: ' + error.message);
        });
    })
    .catch(error => {
      console.error('Error geocoding locations:', error);
      alert('Error finding locations: ' + error.message);
    });
}
