import { WeatherData, ForecastItem, DailyForecastItem } from '../types';

/**
 * Weather Code Mapper for Open-Meteo WMO codes
 */
const mapWeatherCode = (code: number, isDay: boolean = true): { description: string; icon: string } => {
  const d = isDay ? 'd' : 'n';
  const mapping: { [key: number]: { description: string; icon: string } } = {
    0: { description: "Clear sky", icon: `01${d}` },
    1: { description: "Mainly clear", icon: `02${d}` },
    2: { description: "Partly cloudy", icon: `03${d}` },
    3: { description: "Overcast", icon: `04${d}` },
    45: { description: "Fog", icon: `50${d}` },
    48: { description: "Depositing rime fog", icon: `50${d}` },
    51: { description: "Drizzle: Light", icon: "09d" },
    53: { description: "Drizzle: Moderate", icon: "09d" },
    55: { description: "Drizzle: Dense", icon: "09d" },
    56: { description: "Freezing Drizzle: Light", icon: "09d" },
    57: { description: "Freezing Drizzle: Dense", icon: "09d" },
    61: { description: "Rain: Slight", icon: `10${d}` },
    63: { description: "Rain: Moderate", icon: `10${d}` },
    65: { description: "Rain: Heavy", icon: `10${d}` },
    66: { description: "Freezing Rain: Light", icon: `10${d}` },
    67: { description: "Freezing Rain: Heavy", icon: `10${d}` },
    71: { description: "Snow fall: Slight", icon: "13d" },
    73: { description: "Snow fall: Moderate", icon: "13d" },
    75: { description: "Snow fall: Heavy", icon: "13d" },
    77: { description: "Snow grains", icon: "13d" },
    80: { description: "Rain showers: Slight", icon: "09d" },
    81: { description: "Rain showers: Moderate", icon: "09d" },
    82: { description: "Rain showers: Violent", icon: "09d" },
    85: { description: "Snow showers: Slight", icon: "13d" },
    86: { description: "Snow showers: Heavy", icon: "13d" },
    95: { description: "Thunderstorm: Slight or moderate", icon: "11d" },
    96: { description: "Thunderstorm with slight hail", icon: "11d" },
    99: { description: "Thunderstorm with heavy hail", icon: "11d" },
  };
  return mapping[code] || { description: "Unknown", icon: `03${d}` };
};

/**
 * Robust geocoding using Open-Meteo Geocoding API
 */
export const geocodeLocation = async (input: string, _apiKey?: string): Promise<string | null> => {
  if (!input) return null;
  const latLonRegex = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;
  const match = input.match(latLonRegex);

  try {
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[3]);
      // Open-Meteo doesn't have a direct reverse geocoding in the same way, 
      // but we can return the coordinates as a string or use a different service if needed.
      // For now, let's just return the coordinates.
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } else {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input)}&count=1&language=en&format=json`;
      const res = await fetch(geoUrl);
      if (res.ok) {
        const json = await res.json();
        if (json && json.results && json.results.length > 0) {
          const loc = json.results[0];
          return `${loc.name}${loc.admin1 ? `, ${loc.admin1}` : ''} (${loc.country})`;
        }
      }
    }
  } catch (e) {
    console.warn("Geocoding resolution failed", e);
  }
  return null;
};

export const fetchWeatherData = async (locationInput: string, _apiKey?: string, useOpenWeather: boolean = false): Promise<WeatherData> => {
  let lat: number | null = null;
  let lon: number | null = null;
  let resolvedCityName: string = locationInput;

  const latLonRegex = /^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/;
  const coordMatch = locationInput.match(latLonRegex);

  try {
    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lon = parseFloat(coordMatch[3]);
      resolvedCityName = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } else {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationInput)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      const geoJson = await geoRes.json();

      if (geoJson && geoJson.results && geoJson.results.length > 0) {
        const bestMatch = geoJson.results[0];
        lat = bestMatch.latitude;
        lon = bestMatch.longitude;
        resolvedCityName = `${bestMatch.name}${bestMatch.admin1 ? `, ${bestMatch.admin1}` : ''} (${bestMatch.country})`;
      }
    }

    if (lat === null || lon === null) {
      throw new Error(`Location "${locationInput}" could not be resolved. Try a broader city name.`);
    }

    if (useOpenWeather) {
      console.log("OpenWeather API mode active. (Simulating with Open-Meteo due to missing API key)");
    }

    // Fetch all telemetry streams using Open-Meteo
    // NOTE: daily forecast in Open-Meteo is limited to 16 days; flood API can provide longer horizons.
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&forecast_days=16&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,weather_code,pressure_msl,surface_pressure,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,evapotranspiration,shortwave_radiation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,uv_index_clear_sky,is_day,sunshine_duration,wet_bulb_temperature_2m,total_column_integrated_water_vapour,cape,lifted_index,convective_inhibition,freezing_level_height,boundary_layer_height,vapour_pressure_deficit,soil_temperature_0cm,soil_moisture_0_1cm&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,shortwave_radiation_sum&timezone=auto`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,aerosol_optical_depth,dust,uv_index,ammonia,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&hourly=pm10,pm2_5,carbon_monoxide,carbon_dioxide,nitrogen_dioxide,sulphur_dioxide,ozone,aerosol_optical_depth,dust,uv_index,ammonia,methane,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;

    let forecastRes;
    let aqiRes: any = { current: {}, hourly: {} };

    try {
      const response = await fetch(forecastUrl);
      if (!response.ok) throw new Error(`Forecast API error: ${response.statusText}`);
      forecastRes = await response.json();
    } catch (error) {
      console.error("Forecast fetch failed:", error);
      throw new Error("Failed to retrieve weather forecast data.");
    }

    try {
      const response = await fetch(aqiUrl);
      if (response.ok) {
        aqiRes = await response.json();
      } else {
        console.warn("AQI API error:", response.statusText);
      }
    } catch (error) {
      console.warn("AQI fetch failed (non-critical):", error);
    }

    const current = forecastRes.current;
    const hourly = forecastRes.hourly;
    const daily = forecastRes.daily;
    const aqiCurrent = aqiRes.current || {};
    const aqiHourly = aqiRes.hourly || {};
    const isDay = current.is_day === 1;
    const weatherInfo = mapWeatherCode(current.weather_code, isDay);

    // Helper to find the index of the current hour in the hourly arrays
    const getCurrentHourIndex = (times: string[]) => {
      if (!times || times.length === 0) return 0;
      const now = new Date();
      const nowMs = now.getTime();
      
      let minDiff = Infinity;
      let index = 0;
      
      for (let i = 0; i < times.length; i++) {
        const timeMs = new Date(times[i]).getTime();
        const diff = Math.abs(nowMs - timeMs);
        if (diff < minDiff) {
          minDiff = diff;
          index = i;
        }
      }
      return index;
    };

    const currentHourIndex = getCurrentHourIndex(hourly.time);
    const aqiHourIndex = getCurrentHourIndex(aqiHourly.time);

    const rawAqi = aqiCurrent.us_aqi ?? aqiHourly.us_aqi?.[aqiHourIndex] ?? 0;

    // Map raw US AQI (0-500) to 1-5 display scale for the webapp
    // US AQI: 0-50 → 1 (Good), 51-100 → 2 (Moderate), 101-150 → 3 (Unhealthy/Sensitive),
    //         151-200 → 4 (Unhealthy), 201+ → 5 (Very Unhealthy / Hazardous)
    let mappedAqi = 1;
    if (rawAqi > 200) mappedAqi = 5;
    else if (rawAqi > 150) mappedAqi = 4;
    else if (rawAqi > 100) mappedAqi = 3;
    else if (rawAqi > 50) mappedAqi = 2;

    const hourlyForecast: ForecastItem[] = hourly.time.slice(0, 72).map((time: string, i: number) => {
      // determine day/night from sunrise/sunset
      const itemDate = new Date(time);
      const srToday = daily.sunrise?.[0] ? new Date(daily.sunrise[0]) : null;
      const ssToday = daily.sunset?.[0] ? new Date(daily.sunset[0]) : null;
      const itemIsDay = srToday && ssToday ? itemDate >= srToday && itemDate <= ssToday : true;
      const info = mapWeatherCode(hourly.weather_code[i], itemIsDay);
      const dayStr = itemDate.toLocaleDateString('en-US', { weekday: 'short' });
      const timeStr = itemDate.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
      return {
        dt: Math.floor(itemDate.getTime() / 1000),
        time: `${dayStr} ${timeStr}`,
        temp: Math.round(hourly.temperature_2m[i]),
        icon: info.icon,
        description: info.description
      };
    });

    const dailyForecast: DailyForecastItem[] = daily.time.map((time: string, i: number) => {
      const info = mapWeatherCode(daily.weather_code[i], true); // daily icons always 'd'
      return {
        dt: Math.floor(new Date(time).getTime() / 1000),
        date: new Date(time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        minTemp: Math.round(daily.temperature_2m_min[i]),
        maxTemp: Math.round(daily.temperature_2m_max[i]),
        icon: info.icon,
        description: info.description,
        pop: Math.round(daily.precipitation_probability_max[i]),
        precipitationSum: daily.precipitation_sum?.[i],
      };
    });

    const advancedData = {
      boundaryLayerHeight: hourly.boundary_layer_height?.[currentHourIndex],
      cape: hourly.cape?.[currentHourIndex],
      liftedIndex: hourly.lifted_index?.[currentHourIndex],
      convectiveInhibition: hourly.convective_inhibition?.[currentHourIndex],
      freezingLevelHeight: hourly.freezing_level_height?.[currentHourIndex],
      windGusts: current.wind_gusts_10m,
      surfacePressure: current.surface_pressure,
      vapourPressureDeficit: hourly.vapour_pressure_deficit?.[currentHourIndex],
      soilTemperature: hourly.soil_temperature_0cm?.[currentHourIndex],
      soilMoisture: hourly.soil_moisture_0_1cm?.[currentHourIndex],
      // UV (real-time hourly)
      uvIndexClearSky: hourly.uv_index_clear_sky?.[currentHourIndex],
      // Thermal & Moisture
      wetBulbTemperature: hourly.wet_bulb_temperature_2m?.[currentHourIndex],
      totalColumnWaterVapour: hourly.total_column_integrated_water_vapour?.[currentHourIndex],
      sunshineDurationHourly: hourly.sunshine_duration?.[currentHourIndex],
      // Solar & Cloud Layers
      shortwaveRadiation: hourly.shortwave_radiation?.[currentHourIndex],
      cloudCoverLow: hourly.cloud_cover_low?.[currentHourIndex],
      cloudCoverMid: hourly.cloud_cover_mid?.[currentHourIndex],
      cloudCoverHigh: hourly.cloud_cover_high?.[currentHourIndex],
      evapotranspiration: hourly.evapotranspiration?.[currentHourIndex],
      shortwaveRadiationSum: daily.shortwave_radiation_sum?.[0],
      // Air Quality & Pollens - Prefer current, fallback to hourly
      pm10: aqiCurrent.pm10 ?? aqiHourly.pm10?.[aqiHourIndex],
      pm2_5: aqiCurrent.pm2_5 ?? aqiHourly.pm2_5?.[aqiHourIndex],
      co: aqiCurrent.carbon_monoxide ?? aqiHourly.carbon_monoxide?.[aqiHourIndex],
      co2: aqiHourly.carbon_dioxide?.[aqiHourIndex],
      no2: aqiCurrent.nitrogen_dioxide ?? aqiHourly.nitrogen_dioxide?.[aqiHourIndex],
      so2: aqiCurrent.sulphur_dioxide ?? aqiHourly.sulphur_dioxide?.[aqiHourIndex],
      o3: aqiCurrent.ozone ?? aqiHourly.ozone?.[aqiHourIndex],
      aod: aqiCurrent.aerosol_optical_depth ?? aqiHourly.aerosol_optical_depth?.[aqiHourIndex],
      dust: aqiCurrent.dust ?? aqiHourly.dust?.[aqiHourIndex],
      ammonia: aqiCurrent.ammonia ?? aqiHourly.ammonia?.[aqiHourIndex],
      methane: aqiHourly.methane?.[aqiHourIndex],
      alder_pollen: aqiCurrent.alder_pollen ?? aqiHourly.alder_pollen?.[aqiHourIndex],
      birch_pollen: aqiCurrent.birch_pollen ?? aqiHourly.birch_pollen?.[aqiHourIndex],
      grass_pollen: aqiCurrent.grass_pollen ?? aqiHourly.grass_pollen?.[aqiHourIndex],
      mugwort_pollen: aqiCurrent.mugwort_pollen ?? aqiHourly.mugwort_pollen?.[aqiHourIndex],
      olive_pollen: aqiCurrent.olive_pollen ?? aqiHourly.olive_pollen?.[aqiHourIndex],
      ragweed_pollen: aqiCurrent.ragweed_pollen ?? aqiHourly.ragweed_pollen?.[aqiHourIndex]
    };

    return {
      city: resolvedCityName,
      lat: lat,
      lon: lon,
      temp: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      description: weatherInfo.description,
      windSpeed: current.wind_speed_10m,
      windDeg: current.wind_direction_10m,
      clouds: current.cloud_cover,
      pressure: current.pressure_msl,
      visibility: hourly.visibility?.[currentHourIndex],
      aqi: mappedAqi,
      rawAqi: rawAqi,
      uvIndex: hourly.uv_index?.[currentHourIndex] ?? null,   // real-time hourly (0 at night)
      uvIndexDailyMax: daily.uv_index_max?.[0] ?? null,        // today's forecast peak
      dewPoint: hourly.dew_point_2m?.[currentHourIndex],
      isDay: isDay,
      utcOffsetSeconds: forecastRes.utc_offset_seconds,
      windGusts: current.wind_gusts_10m,
      precipitation: current.precipitation,
      daylightDuration: daily.daylight_duration?.[0],
      sunshineDuration: daily.sunshine_duration?.[0],
      precipitationSum: daily.precipitation_sum?.[0],
      sunrise: daily.sunrise?.[0],
      sunset: daily.sunset?.[0],
      sunrises: daily.sunrise,
      sunsets: daily.sunset,
      pop: Math.round(hourly.precipitation_probability?.[currentHourIndex] || 0),
      icon: weatherInfo.icon,
      forecastText: hourlyForecast.slice(0, 8).map(f => `${f.time}: ${f.temp}°C`).join(' | '),
      todaySummary: `High of ${Math.round(daily.temperature_2m_max[0])}°C, low of ${Math.round(daily.temperature_2m_min[0])}°C. ${weatherInfo.description}.`,
      tomorrowSummary: `High of ${Math.round(daily.temperature_2m_max[1])}°C, low of ${Math.round(daily.temperature_2m_min[1])}°C. ${mapWeatherCode(daily.weather_code[1]).description}.`,
      forecast: hourlyForecast,
      dailyForecast: dailyForecast,
      advancedData: advancedData
    };
  } catch (error) {
    console.error("Weather fetching error:", error);
    throw new Error(`Bio-Sensor Network Failure: Connection to ${useOpenWeather ? 'OpenWeather' : 'Open-Meteo'} interrupted.`);
  }
};
