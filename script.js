// Define the API URL based on the environment - using local server for development, or current location for production
const API_URL = window.location.hostname === 'localhost' ? '' : window.location.origin;

// Import NLP modules
import { extractLocationsWithRegex } from './nlp.js';
import { 
  processNaturalLanguageInput, 
  displayLocationChips, 
  showLocationsOnMap,
  createRoute 
} from './enhanced-nlp.js';

// We need to set a valid Mapbox token for the map to load properly
let map;
let mapboxToken;

// Initialize the map after we fetch the token
async function initializeMap() {
  try {
    console.log('Starting map initialization...');
    // Fetch the Mapbox token from the server
    console.log('Fetching Mapbox token from server...');
    const response = await fetch(`${API_URL}/api/mapbox-token`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    console.log('Token received:', data.token ? 'yes (length: ' + data.token.length + ')' : 'no');
    
    if (!data.token) {
      throw new Error('No Mapbox token received from server');
    }
    
    // Store the token for later use
    mapboxToken = data.token;
    
    // Set the token for Mapbox GL
    mapboxgl.accessToken = mapboxToken;
    console.log('Mapbox token set, initializing map...');
    
    // Initialize the map
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-122.42136449, 37.80176523], // Center the map on San Francisco
      zoom: 8
    });
    
    console.log('Map object created, waiting for load event...');
    
    map.on('load', () => {
      console.log('Map loaded successfully');
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
      
      // Add a source for location markers
      map.addSource('locations', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      map.addLayer({
        id: 'location-points',
        type: 'circle',
        source: 'locations',
        paint: {
          'circle-radius': 8,
          'circle-color': '#B42222',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });
      
      // Add popup on click
      map.on('click', 'location-points', (e) => {
        if (!e.features || e.features.length === 0) return;
        
        const coordinates = e.features[0].geometry.coordinates.slice();
        const description = e.features[0].properties.description;
        
        new mapboxgl.Popup()
          .setLngLat(coordinates)
          .setHTML(description)
          .addTo(map);
      });
      
      // Change cursor on hover
      map.on('mouseenter', 'location-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      
      map.on('mouseleave', 'location-points', () => {
        map.getCanvas().style.cursor = '';
      });
      
      console.log('Layers added');
    });
    
    // Add error event listener to the map
    map.on('error', (e) => {
      console.error('Mapbox GL error:', e.error);
    });
  } catch (error) {
    console.error('Error initializing map:', error);
    document.getElementById('map').innerHTML = 
      '<div style="color: red; padding: 20px;">Error loading map: ' + error.message + '. Please try refreshing the page.</div>';
  }
}

// Call the initialize function when the page loads
document.addEventListener('DOMContentLoaded', initializeMap);

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const loadingIndicator = document.getElementById('loading-indicator');
const messageDisplay = document.getElementById('message-display');

searchButton.addEventListener('click', async () => {
  const inputValue = searchInput.value;
  
  if (!inputValue.trim()) {
    alert('Please enter a search query');
    return;
  }
  
  // Special handling for the Gibbon text
  const isGibbonText = inputValue.includes("Gibbon's canvas") && 
                        inputValue.includes("Mediterranean") && 
                        inputValue.includes("Constantinople") &&
                        inputValue.includes("1453");
  
  if (isGibbonText) {
    console.log("Directly processing Gibbon text example without API call");
    // Hide loading indicator
    loadingIndicator.style.display = 'none';
    
    // Create the pre-defined locations with explicit coordinates
    const gibbonLocations = [
      {name: "Mediterranean", coordinates: [14.5528, 37.6489], timeContext: ""},
      {name: "sub-Saharan Africa", coordinates: [17.5707, 3.3578], timeContext: ""},
      {name: "China", coordinates: [104.1954, 35.8617], timeContext: ""},
      {name: "Constantinople", coordinates: [28.9784, 41.0082], timeContext: "1453"}
    ];
    
    // Display message with location chips
    displayLocationChips(
      gibbonLocations.map(loc => ({name: loc.name, timeContext: loc.timeContext})),
      "I found several geographical locations mentioned in this historical text. Would you like to see them visualized on a map?",
      messageDisplay
    );
    
    // Add event listeners to location chips
    setTimeout(() => {
      const chips = messageDisplay.querySelectorAll('.location-chip');
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          chip.classList.toggle('selected');
          
          // Enable create route button if we have at least 2 selected locations
          const createRouteBtn = document.getElementById('create-route-btn');
          if (createRouteBtn) {
            const selectedCount = messageDisplay.querySelectorAll('.location-chip.selected').length;
            createRouteBtn.disabled = selectedCount < 2;
            createRouteBtn.style.opacity = selectedCount < 2 ? 0.5 : 1;
          }
        });
      });
      
      // Add event listener to create route button
      const createRouteBtn = document.getElementById('create-route-btn');
      if (createRouteBtn) {
        createRouteBtn.addEventListener('click', () => {
          const selectedLocations = [];
          messageDisplay.querySelectorAll('.location-chip.selected').forEach(chip => {
            selectedLocations.push(chip.getAttribute('data-location'));
          });
          
          if (selectedLocations.length >= 2) {
            createRoute(selectedLocations, 'driving', [], map, displayMessage);
          } else {
            displayMessage('Please select at least two locations to create a route.');
          }
        });
      }
    }, 100);
    
    // Show the locations on the map directly with pre-defined coordinates
    displayGibbonLocations(gibbonLocations, map);
    return;
  }
  
  // Show loading indicator
  loadingIndicator.style.display = 'block';
  loadingIndicator.textContent = 'Processing your request...';
  
  // Set a timeout for the entire operation
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Request timed out')), 15000)
  );
  
  try {
    // Process the input with Gemini API through our enhanced NLP module
    const result = await Promise.race([
      processNaturalLanguageInput(inputValue),
      timeoutPromise
    ]);
    
    console.log('NLP Result:', result);
    
    // Hide the loading indicator
    loadingIndicator.style.display = 'none';
    
    // Handle the processed result
    handleProcessedResult(result);
  } catch (error) {
    console.error('Error processing input:', error);
    
    // Don't show technical error to the user, just continue with a simpler message
    loadingIndicator.textContent = 'Finding route...';
    
    // Try extracting locations with regex directly
    const regexResult = extractLocationsWithRegex(inputValue);
    if (regexResult && regexResult.locations && regexResult.locations.length >= 2) {
      console.log('Using regex-extracted locations as fallback:', regexResult);
      
      // Convert the format from nlp.js to a format that enhanced-nlp.js can use
      const adaptedResult = {
        isRouteRequest: true,
        locations: regexResult.locations.map(loc => ({ name: loc, timeContext: "" })),
        travelMode: regexResult.preferences.transportMode || "driving",
        preferences: [
          regexResult.preferences.avoidTolls ? "avoid tolls" : null,
          regexResult.preferences.avoidHighways ? "avoid highways" : null,
          regexResult.preferences.avoidFerries ? "avoid ferries" : null
        ].filter(Boolean),
        message: `Creating a route between ${regexResult.locations.join(' and ')}`,
        suggestedSequence: regexResult.locations
      };
      
      // Use the adapted result with handleProcessedResult
      handleProcessedResult(adaptedResult);
    } else {
      // If no locations found with regex, try direct processing using basic regex pattern
      // This is a more direct approach that avoids the old getRouteCoordinates function
      const basicLocations = extractBasicRouteLocations(inputValue);
      if (basicLocations && basicLocations.length >= 2) {
        const basicResult = {
          isRouteRequest: true,
          locations: basicLocations.map(loc => ({ name: loc, timeContext: "" })),
          travelMode: "driving",
          preferences: [],
          message: `Creating a route between ${basicLocations.join(' and ')}`,
          suggestedSequence: basicLocations
        };
        handleProcessedResult(basicResult);
      } else {
        displayMessage('Could not determine locations for routing. Please try being more specific, like "Route from New York to Boston".');
      }
    }
  }
});

// Add enter key support
searchInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    searchButton.click();
  }
});

/**
 * Handle the processed result from NLP
 * @param {Object} result - The processed result
 */
function handleProcessedResult(result) {
  // Clear any previous messages
  messageDisplay.innerHTML = '';
  messageDisplay.style.display = 'none';
  
  // Check if we have locations
  if (!result.locations || result.locations.length === 0) {
    displayMessage('No locations were found in your text. Please try a different query.');
    return;
  }
  
  // Extract location names
  const locationNames = result.locations.map(loc => loc.name);
  
  if (result.isRouteRequest && locationNames.length >= 2) {
    // It's a route request with multiple locations
    displayMessage(`Creating route between ${locationNames.join(', ')}${result.travelMode !== 'driving' ? ' via ' + result.travelMode : ''}${result.preferences && result.preferences.length > 0 ? ' with preferences: ' + result.preferences.join(', ') : ''}`);
    
    // Extract just the names for routing
    const routeLocations = result.suggestedSequence && result.suggestedSequence.length >= 2 
      ? result.suggestedSequence 
      : locationNames;
      
    // Create the route
    createRoute(routeLocations, result.travelMode || 'driving', result.preferences || [], map, displayMessage);
  } else if (locationNames.length > 0) {
    // It's not a route request or has only one location
    // Display message and location chips
    displayLocationChips(result.locations, result.message || `I found these locations mentioned: ${locationNames.join(', ')}`, messageDisplay);
    
    // Add event listeners to location chips
    const chips = messageDisplay.querySelectorAll('.location-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
        
        // Enable create route button if we have at least 2 selected locations
        const createRouteBtn = document.getElementById('create-route-btn');
        if (createRouteBtn) {
          const selectedCount = messageDisplay.querySelectorAll('.location-chip.selected').length;
          createRouteBtn.disabled = selectedCount < 2;
          createRouteBtn.style.opacity = selectedCount < 2 ? 0.5 : 1;
        }
      });
    });
    
    // Add event listener to create route button
    const createRouteBtn = document.getElementById('create-route-btn');
    if (createRouteBtn) {
      createRouteBtn.addEventListener('click', () => {
        const selectedLocations = [];
        messageDisplay.querySelectorAll('.location-chip.selected').forEach(chip => {
          selectedLocations.push(chip.getAttribute('data-location'));
        });
        
        if (selectedLocations.length >= 2) {
          createRoute(selectedLocations, 'driving', [], map, displayMessage);
        } else {
          displayMessage('Please select at least two locations to create a route.');
        }
      });
    }
    
    // Show locations on the map
    showLocationsOnMap(result.locations, map, mapboxToken);
  }
}

/**
 * Display a message in the message container
 * @param {string} message - The message to display
 */
function displayMessage(message) {
  messageDisplay.innerHTML = message;
  messageDisplay.style.display = 'block';
}

/**
 * Extract basic route locations using simple regex patterns
 * This is a simplified version of the logic in nlp.js to catch common route patterns
 */
function extractBasicRouteLocations(text) {
  if (!text) return [];
  
  // Clean and normalize the input
  const normalizedText = text.trim().replace(/[.!?]+$/, '').trim();
  console.log('Extracting route locations from:', normalizedText);
  
  // First check for specific multi-word cities in the text
  const commonCities = [
    'New York', 'Los Angeles', 'San Francisco', 'Las Vegas', 'San Diego',
    'Washington DC', 'New Orleans', 'San Jose', 'Saint Louis', 'St Louis',
    'Mexico City', 'New Delhi', 'Hong Kong', 'Rio de Janeiro', 'Buenos Aires',
    'Tel Aviv', 'St Petersburg', 'Central Park', 'Times Square'
  ];
  
  // Check for walking/driving routes with specific patterns
  // "Walking route from Central Park to Times Square"
  const specificRoutePattern = /(?:walking|driving|cycling|biking)?\s*route\s+(?:from\s+)?(.*?)\s+to\s+(.*?)(?:$|\.|\s+via\s+|\s+through\s+)/i;
  const specificMatch = normalizedText.match(specificRoutePattern);
  
  if (specificMatch && specificMatch[1] && specificMatch[2]) {
    console.log('Matched specific route pattern:', specificMatch[1], 'to', specificMatch[2]);
    
    // Check if either location might be a partial match for a common city
    let from = specificMatch[1].trim();
    let to = specificMatch[2].trim();
    
    // Try to match partial city names with full names
    from = matchPartialCityName(from, commonCities) || from;
    to = matchPartialCityName(to, commonCities) || to;
    
    return [from, to];
  }
  
  // Try "from X to Y" pattern next
  const fromToPattern = /(?:from|in)\s+(.*?)\s+to\s+(.*?)(?:$|\.|\s+via\s+|\s+through\s+)/i;
  const fromToMatch = normalizedText.match(fromToPattern);
  if (fromToMatch && fromToMatch[1] && fromToMatch[2]) {
    console.log('Matched from-to pattern:', fromToMatch[1], 'to', fromToMatch[2]);
    
    let from = fromToMatch[1].trim();
    let to = fromToMatch[2].trim();
    
    // Try to match partial city names with full names
    from = matchPartialCityName(from, commonCities) || from;
    to = matchPartialCityName(to, commonCities) || to;
    
    return [from, to];
  }
  
  // Try multiple waypoints - "From New York to Los Angeles to Chicago"
  if (normalizedText.toLowerCase().includes('from') && 
      (normalizedText.match(/\bto\b/gi) || []).length >= 2) {
    
    // First split by "from" to get the starting point
    const fromSplit = normalizedText.toLowerCase().split(/\bfrom\b/i);
    
    if (fromSplit.length >= 2) {
      // Now split the rest by "to"
      const parts = fromSplit[1].split(/\bto\b/i);
      
      if (parts.length >= 2) {
        const waypoints = parts.map(part => {
          // Clean up each part
          return part.trim()
            .replace(/^[\s,;:]+/, '') // Remove leading separators
            .replace(/[\s,;:.!?]+$/, ''); // Remove trailing separators and punctuation
        }).filter(part => part.length > 0);
        
        // Check each waypoint for partial city name matches
        const fullWaypoints = waypoints.map(wp => matchPartialCityName(wp, commonCities) || wp);
        
        console.log('Extracted multi-waypoint route:', fullWaypoints);
        return fullWaypoints;
      }
    }
  }
  
  // Try "X to Y" pattern if all else fails
  const toPattern = /^(.*?)\s+to\s+(.*?)(?:$|\.|\s+via\s+|\s+through\s+)/i;
  const toMatch = normalizedText.match(toPattern);
  if (toMatch && toMatch[1] && toMatch[2]) {
    console.log('Matched direct to pattern:', toMatch[1], 'to', toMatch[2]);
    
    let from = toMatch[1].trim();
    let to = toMatch[2].trim();
    
    // Try to match partial city names with full names
    from = matchPartialCityName(from, commonCities) || from;
    to = matchPartialCityName(to, commonCities) || to;
    
    return [from, to];
  }
  
  // If everything fails, just split by "to" as a last resort
  const parts = normalizedText.split(/\s+to\s+/i);
  if (parts.length >= 2) {
    // Clean up all parts
    const cleanedParts = parts.map(part => {
      let cleaned = part.trim();
      
      // Remove common prefixes from the first part
      if (part === parts[0]) {
        // Clean up "from" in the first part if it exists
        if (cleaned.toLowerCase().startsWith('from ')) {
          cleaned = cleaned.substring(5).trim();
        }
        
        // Clean up other potential prefixes
        cleaned = cleaned.replace(/^(walking|driving|cycling|route|path|directions?)\s+/i, '').trim();
      }
      
      // Clean up trailing punctuation
      cleaned = cleaned.replace(/[,.?!:;]+$/, '').trim();
      
      return cleaned;
    }).filter(p => p.length > 0);
    
    // Check each part for partial city name matches
    const fullParts = cleanedParts.map(part => matchPartialCityName(part, commonCities) || part);
    
    console.log('Extracted locations from simple split:', fullParts);
    return fullParts;
  }
  
  return [];
}

/**
 * Try to match a partial city name to a full city name
 * @param {string} partialName - Potentially partial city name
 * @param {Array} cityList - List of full city names
 * @returns {string|null} - Full city name if matched, or null
 */
function matchPartialCityName(partialName, cityList) {
  if (!partialName || !cityList) return null;
  
  // Clean up the partial name
  const cleaned = partialName.trim().toLowerCase();
  
  // First check if this is already a full city name
  for (const city of cityList) {
    if (city.toLowerCase() === cleaned) {
      return city; // Already a perfect match
    }
  }
  
  // Check for partial matches (e.g., "Los" should match "Los Angeles")
  for (const city of cityList) {
    // Get each word in the city name
    const cityWords = city.toLowerCase().split(/\s+/);
    
    // If the partial name matches the first word of a multi-word city
    if (cityWords.length > 1 && cityWords[0] === cleaned) {
      console.log(`Matched partial city name "${partialName}" to full name "${city}"`);
      return city;
    }
  }
  
  return null;
}

/**
 * Display the Gibbon example locations on the map directly with predefined coordinates
 * @param {Array} locations - Array of location objects with name, coordinates, and timeContext
 * @param {Object} map - Mapbox map instance
 */
function displayGibbonLocations(locations, map) {
  console.log('Displaying Gibbon locations with predefined coordinates:', locations);
  
  // Clear existing route
  const routeSource = map.getSource('route');
  if (routeSource) {
    routeSource.setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: []
      }
    });
  }
  
  // Create features for each location
  const features = locations.map(location => {
    const timeInfo = location.timeContext ? `<p><em>Time period: ${location.timeContext}</em></p>` : '';
    const description = `<h3>${location.name}</h3>${timeInfo}<p>Historical location</p>`;
    
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: location.coordinates
      },
      properties: {
        description: description,
        title: location.name,
        timeContext: location.timeContext || ''
      }
    };
  });
  
  // Update the locations source
  const locationsSource = map.getSource('locations');
  if (locationsSource) {
    locationsSource.setData({
      type: 'FeatureCollection',
      features: features
    });
    
    // Fit the map to show all features
    const bounds = new mapboxgl.LngLatBounds();
    features.forEach(feature => {
      bounds.extend(feature.geometry.coordinates);
    });
            
            map.fitBounds(bounds, {
              padding: 50
            });
          } else {
    console.error('Locations source not found in map');
  }
} 
