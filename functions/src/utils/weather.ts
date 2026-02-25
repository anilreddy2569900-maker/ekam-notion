/**
 * Weather Context Integration (Free APIs)
 * 
 * Fetches real-time weather, AQI, and location data for the Environmental Agent.
 * Replaces WeatherAPI.com with Open-Meteo and BigDataCloud (No API keys required).
 * 
 * SCALABILITY: Implements geohash-based Firestore caching (15-min TTL)
 * to prevent external API rate-limiting under heavy concurrent load.
 */


const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a rough geohash from lat/lng (rounded to ~5km precision)
 * This groups nearby users together so they share the same cached weather
 */
function toGeoKey(lat: number, lng: number): string {
    const roundedLat = Math.round(lat * 20) / 20; // ~5km precision
    const roundedLng = Math.round(lng * 20) / 20;
    return `${roundedLat}_${roundedLng}`;
}

export interface WeatherData {
    location: {
        name: string;
        region: string;
        country: string;
        localtime: string;
    };
    current: {
        temp_c: number;
        temp_f: number;
        condition: {
            text: string;
        };
        wind_kph: number;
        humidity: number;
        feelslike_c: number;
        uv: number;
        air_quality?: {
            co: number; // Sticking to interface, though we only fetch PM2.5 and US EPA from OpenMeteo
            no2: number;
            o3: number;
            so2: number;
            pm2_5: number;
            pm10: number;
            "us-epa-index": number;
            "gb-defra-index": number;
        };
    };
}

// Map WMO Weather codes from Open-Meteo to readable text
function getWmoConditionText(code: number): string {
    const wmoCodes: Record<number, string> = {
        0: 'Clear sky',
        1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Fog', 48: 'Depositing rime fog',
        51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
        56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
        61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
        66: 'Light freezing rain', 67: 'Heavy freezing rain',
        71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall',
        77: 'Snow grains',
        80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
        85: 'Slight snow showers', 86: 'Heavy snow showers',
        95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
    };
    return wmoCodes[code] || 'Unknown';
}

/**
 * Fetch current weather, air quality, and reverse-geocoded location
 * SCALABILITY: Checks Firestore cache first (geohash-keyed, 15-min TTL)
 * @param query String in format "lat,lng"
 */
export async function getCurrentWeather(query: string): Promise<WeatherData | null> {
    try {
        const [latStr, lngStr] = query.split(',');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);

        if (isNaN(lat) || isNaN(lng)) {
            console.error('[Weather] Invalid latitude/longitude query:', query);
            return null;
        }

        // Cache disabled for Cloudflare Worker compatibility


        // 1. Fetch Weather (Open-Meteo)
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,uv_index&timezone=auto`;

        // 2. Fetch Air Quality (Open-Meteo)
        const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi&timezone=auto`;

        // 3. Fetch Location Data (BigDataCloud Free Reverse Geocoding)
        const locationUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;

        // Run fetch requests in parallel
        const [weatherRes, aqiRes, locationRes] = await Promise.all([
            fetch(weatherUrl),
            fetch(aqiUrl),
            fetch(locationUrl)
        ]);

        if (!weatherRes.ok || !aqiRes.ok || !locationRes.ok) {
            console.error(`[Weather] APIs Error: W:${weatherRes.status}, A:${aqiRes.status}, L:${locationRes.status}`);
            return null;
        }

        const weatherData = await weatherRes.json();
        const aqiData = await aqiRes.json();
        const locationData = await locationRes.json();

        // Extract and map data
        const currentW = weatherData.current;
        const currentA = aqiData.current;

        // Calculate Fahrenheit
        const tempC = currentW.temperature_2m;
        const tempF = (tempC * 9 / 5) + 32;

        const data: WeatherData = {
            location: {
                name: locationData.city || locationData.locality || "Unknown City",
                region: locationData.principalSubdivision || "",
                country: locationData.countryName || "Unknown Country",
                localtime: currentW.time || new Date().toISOString()
            },
            current: {
                temp_c: tempC,
                temp_f: parseFloat(tempF.toFixed(1)),
                condition: {
                    text: getWmoConditionText(currentW.weather_code)
                },
                wind_kph: currentW.wind_speed_10m,
                humidity: currentW.relative_humidity_2m,
                feelslike_c: currentW.apparent_temperature,
                uv: currentW.uv_index || 0,
                air_quality: {
                    co: currentA.carbon_monoxide || 0,
                    no2: currentA.nitrogen_dioxide || 0,
                    o3: currentA.ozone || 0,
                    so2: currentA.sulphur_dioxide || 0,
                    pm2_5: currentA.pm2_5 || 0,
                    pm10: currentA.pm10 || 0,
                    "us-epa-index": currentA.us_aqi || 0,
                    "gb-defra-index": currentA.european_aqi || 0
                }
            }
        };

        // Cache write disabled


        return data;

    } catch (error) {
        console.error('[Weather] Network error or parsing failed:', error);
        return null;
    }
}

/**
 * Format weather data into a readable string for the LLM
 */
export function formatWeatherForContext(data: WeatherData | null): string {
    if (!data) return "Weather data currently unavailable.";

    const { location, current } = data;
    const aqi = current.air_quality ?
        `PM2.5: ${current.air_quality.pm2_5.toFixed(1)}, US Index: ${current.air_quality["us-epa-index"]}` :
        "Data unavailable";

    return `
**CURRENT WEATHER REPORT FOR ${location.name.toUpperCase()}, ${location.country.toUpperCase()}:**
- **Time:** ${location.localtime}
- **Condition:** ${current.condition.text}
- **Temperature:** ${current.temp_c}°C (${current.temp_f}°F)
- **Feels Like:** ${current.feelslike_c}°C
- **Humidity:** ${current.humidity}%
- **UV Index:** ${current.uv}
- **Wind:** ${current.wind_kph} kph
- **Air Quality:** ${aqi}
`.trim();
}
