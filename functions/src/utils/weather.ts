
/**
 * WeatherAPI.com Integration
 * 
 * Fetches real-time weather data for the Environmental Agent.
 */

const WEATHER_API_KEY = '5fd051d625454ade86985011260702';
const BASE_URL = 'http://api.weatherapi.com/v1';

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
            co: number;
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

/**
 * Fetch current weather and air quality for a given location (lat,lng or city name)
 */
export async function getCurrentWeather(query: string): Promise<WeatherData | null> {
    try {
        // Include AQI=yes to get air quality data
        const url = `${BASE_URL}/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(query)}&aqi=yes`;

        const response = await fetch(url);

        if (!response.ok) {
            console.error(`[WeatherAPI] Error fetching weather: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        return data as WeatherData;

    } catch (error) {
        console.error('[WeatherAPI] Network error:', error);
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
        `PM2.5: ${current.air_quality.pm2_5.toFixed(1)}, US EPA Index: ${current.air_quality["us-epa-index"]}` :
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
