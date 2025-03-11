// Natural Language Processing module using Gemini API via server proxy

/**
 * Process natural language input to extract locations and route preferences
 * @param {string} query - The natural language query from the user
 * @returns {Promise<Object>} - Structured data with locations and preferences
 */
async function processNaturalLanguage(query) {
  try {
    // First try using function calling capabilities
    const response = await fetchGeminiWithFunctionCalling(query);
    return validateAndFormatResponse(response);
  } catch (error) {
    console.error('Error with function calling approach:', error);
    
    try {
      // Fallback to traditional prompt-based approach
      console.log('Falling back to traditional prompt approach');
      const prompt = `
        Extract location information and route preferences from the following text.
        Return a JSON object with the following structure:
        {
          "locations": [array of location names in order],
          "preferences": {
            "transportMode": "driving/walking/cycling/etc",
            "avoidTolls": boolean,
            "avoidHighways": boolean,
            "avoidFerries": boolean
          }
        }
        
        Important instructions:
        1. Ignore common prepositions like "from", "to", "through", "via", "between", "starting at", "ending at" when extracting locations.
        2. Only include actual place names, cities, addresses, or landmarks in the locations array.
        3. Preserve the correct order of locations as they appear in the text.
        4. Keep multi-word location names together (e.g., "New York", "Los Angeles", "San Francisco") - do not split them.
        5. If any preference is not specified, use null for that value.
        6. Be flexible with input formats and focus on extracting the key information.
        7. If you're uncertain about a location name, include it anyway.
        
        Text: "${query}"
      `;

      const response = await fetchGeminiResponse(prompt);
      return validateAndFormatResponse(response);
    } catch (secondError) {
      console.error('Error with traditional prompt approach:', secondError);
      
      // Final fallback: try to extract locations using regex patterns
      return extractLocationsWithRegex(query);
    }
  }
}

/**
 * Call the Gemini API with function calling capabilities via server proxy
 * @param {string} query - The user's natural language query
 * @returns {Promise<Object>} - The structured data extracted from the query
 */
async function fetchGeminiWithFunctionCalling(query) {
  const url = '/api/gemini';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: query,
      functionCalling: true
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Try to extract the function call results
  if (data.candidates && 
      data.candidates[0] && 
      data.candidates[0].content && 
      data.candidates[0].content.parts) {
    
    for (const part of data.candidates[0].content.parts) {
      if (part.functionCall && part.functionCall.name === "extractRouteInfo") {
        return JSON.parse(JSON.stringify(part.functionCall.args));
      }
    }
    
    // If we didn't find a function call, try to extract from text
    for (const part of data.candidates[0].content.parts) {
      if (part.text) {
        try {
          // Find JSON content within the response
          const jsonMatch = part.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                           part.text.match(/({[\s\S]*})/);
          
          if (jsonMatch && jsonMatch[1]) {
            return JSON.parse(jsonMatch[1].trim());
          }
        } catch (error) {
          console.error('Failed to parse text response as JSON:', error);
        }
      }
    }
  }
  
  throw new Error('Could not extract structured data from Gemini response');
}

/**
 * Call the Gemini API with the given prompt via server proxy
 * @param {string} prompt - The prompt to send to Gemini
 * @returns {Promise<Object>} - The parsed JSON response
 */
async function fetchGeminiResponse(prompt) {
  const url = '/api/gemini';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: prompt,
      functionCalling: false
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Extract the text response from Gemini
  if (data.candidates && 
      data.candidates[0] && 
      data.candidates[0].content && 
      data.candidates[0].content.parts && 
      data.candidates[0].content.parts[0]) {
    const textResponse = data.candidates[0].content.parts[0].text;
    
    // Try to extract JSON from the response
    try {
      // Look for JSON code blocks
      const jsonMatch = textResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1].trim());
      }
      
      // Look for JSON objects
      const objectMatch = textResponse.match(/({[\s\S]*})/);
      if (objectMatch && objectMatch[1]) {
        return JSON.parse(objectMatch[1].trim());
      }
      
      // If we can't find a JSON block, try to parse the entire response
      return JSON.parse(textResponse.trim());
    } catch (error) {
      console.error('Failed to parse Gemini response as JSON:', error);
      throw new Error('Could not parse Gemini response as JSON');
    }
  }
  
  throw new Error('Invalid response format from Gemini API');
}

/**
 * Fallback method to extract locations using regex patterns
 * @param {string} query - The user's natural language query
 * @returns {Object} - Basic structured data with locations
 */
function extractLocationsWithRegex(query) {
  console.log('Using regex fallback for location extraction');
  
  // Remove any trailing punctuation
  const cleanQuery = query.trim().replace(/[.!?]+$/, '').trim();
  
  // Check if the query starts with "from"
  const startsWithFrom = cleanQuery.toLowerCase().startsWith('from ');
  
  // Split by "to" keyword
  const parts = cleanQuery.split(/\s+to\s+/i);
  
  let locations = [];
  
  if (parts.length > 1) {
    // If we have parts split by "to", use them as locations
    locations = parts.map(part => part.trim());
    
    // If the first part starts with "from", remove it
    if (startsWithFrom && locations.length > 0) {
      locations[0] = locations[0].replace(/^from\s+/i, '').trim();
    }
  } else if (startsWithFrom) {
    // If it starts with "from" but has no "to", extract the location after "from"
    locations = [cleanQuery.replace(/^from\s+/i, '').trim()];
  } else {
    // Just use the whole query as a single location
    locations = [cleanQuery];
  }
  
  // Filter out empty locations
  locations = locations.filter(loc => loc.length > 0);
  
  // Extract basic preferences
  const transportMode = 
    cleanQuery.includes('walking') ? 'walking' :
    cleanQuery.includes('cycling') || cleanQuery.includes('bike') ? 'cycling' :
    'driving';
  
  const avoidTolls = cleanQuery.includes('avoid tolls') || cleanQuery.includes('no tolls');
  const avoidHighways = cleanQuery.includes('avoid highways') || cleanQuery.includes('no highways');
  const avoidFerries = cleanQuery.includes('avoid ferries') || cleanQuery.includes('no ferries');
  
  return {
    locations,
    preferences: {
      transportMode,
      avoidTolls,
      avoidHighways,
      avoidFerries
    }
  };
}

/**
 * Validate and format the response from Gemini
 * @param {Object} response - The raw response from Gemini
 * @returns {Object} - Validated and formatted response
 */
function validateAndFormatResponse(response) {
  // Ensure we have a valid response object
  if (!response) {
    throw new Error('Empty response from NLP processing');
  }
  
  // Ensure locations is an array
  if (!response.locations || !Array.isArray(response.locations)) {
    response.locations = [];
  }
  
  // Filter out any empty locations
  response.locations = response.locations.filter(loc => loc && typeof loc === 'string' && loc.trim().length > 0);
  
  // Ensure preferences is an object
  if (!response.preferences || typeof response.preferences !== 'object') {
    response.preferences = {};
  }
  
  // Set default values for missing preferences
  const preferences = response.preferences;
  preferences.transportMode = preferences.transportMode || 'driving';
  preferences.avoidTolls = preferences.avoidTolls === true;
  preferences.avoidHighways = preferences.avoidHighways === true;
  preferences.avoidFerries = preferences.avoidFerries === true;
  
  return response;
}

// Export the main function
export { processNaturalLanguage };
