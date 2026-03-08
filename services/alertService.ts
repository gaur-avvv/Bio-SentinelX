import { WeatherData, HealthAlert, AlertSeverity, AlertCategory, AlertSession } from '../types';
import { notificationPlainText } from '../utils/notificationText';

// ─── Unique ID helper ─────────────────────────────────────────────────────────
let _seq = 0;
const uid = () => `alert_${Date.now()}_${++_seq}`;

// ─── Determine current session (morning / afternoon / evening) ────────────────
export const getCurrentSession = (utcOffsetSeconds = 0): AlertSession => {
  const d = new Date(Date.now() + utcOffsetSeconds * 1000);
  const h = d.getUTCHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
};

// ─── Alert rule definitions ───────────────────────────────────────────────────
interface AlertRule {
  category: AlertCategory;
  emoji: string;
  check: (w: WeatherData) => { triggered: boolean; severity: AlertSeverity; title: string; message: string; healthTip: string; factor: string; value: string } | null;
}

const ALERT_RULES: AlertRule[] = [
  // ── HUMIDITY ──────────────────────────────────────────────────────────────
  {
    category: 'humidity',
    emoji: '💧',
    check: (w) => {
      if (w.humidity < 20)
        return {
          triggered: true, severity: 'critical',
          title: 'Critically Low Humidity',
          message: `Humidity is dangerously low at ${w.humidity}%. Your skin, lips, eyes, and nasal passages are at high risk of severe dryness. Respiratory membranes can crack, increasing infection risk.`,
          healthTip: 'Drink at least 3 L of water today. Apply thick moisturiser and lip balm every 2 hours. Use a humidifier indoors. Wear a face mask outdoors to protect airways.',
          factor: 'Humidity', value: `${w.humidity}%`,
        };
      if (w.humidity < 30)
        return {
          triggered: true, severity: 'warning',
          title: 'Low Humidity — Skin & Lip Alert',
          message: `Humidity is low at ${w.humidity}%. Expect dry skin, chapped lips, itchy eyes, and static electricity. People with eczema or asthma are more vulnerable.`,
          healthTip: 'Moisturise skin and lips frequently. Stay hydrated. Use a humidifier at home. Avoid long hot showers which strip skin oils.',
          factor: 'Humidity', value: `${w.humidity}%`,
        };
      if (w.humidity > 85)
        return {
          triggered: true, severity: 'warning',
          title: 'High Humidity — Mold & Respiratory Alert',
          message: `Humidity is very high at ${w.humidity}%. Mold, dust mites, and bacteria thrive in such conditions. Sweat evaporates poorly, increasing heat stress risk.`,
          healthTip: 'Ventilate rooms well. Use a dehumidifier if possible. Avoid prolonged outdoor exertion. Watch for signs of heat exhaustion.',
          factor: 'Humidity', value: `${w.humidity}%`,
        };
      if (w.humidity > 95)
        return {
          triggered: true, severity: 'critical',
          title: 'Extreme Humidity — Heat Stress Critical',
          message: `Humidity at ${w.humidity}% is near saturation. The body cannot cool itself effectively — heat stroke risk is very high even at moderate temperatures.`,
          healthTip: 'Stay indoors in air-conditioned spaces. Do NOT exercise outdoors. Consume cold fluids every 15 minutes. Watch for heat exhaustion symptoms.',
          factor: 'Humidity', value: `${w.humidity}%`,
        };
      return null;
    },
  },

  // ── TEMPERATURE ───────────────────────────────────────────────────────────
  {
    category: 'temperature',
    emoji: '🌡️',
    check: (w) => {
      if (w.temp > 42)
        return {
          triggered: true, severity: 'critical',
          title: 'Extreme Heat — Heat Stroke Danger',
          message: `Temperature is ${w.temp}°C — an extreme heat event. Risk of heat stroke, organ damage, and death without immediate cooling.`,
          healthTip: 'Stay in air-conditioned spaces. Avoid any outdoor activity. Apply cold wet cloths to neck/wrists. Call emergency services if anyone shows confusion, hot dry skin, or fainting.',
          factor: 'Temperature', value: `${w.temp}°C`,
        };
      if (w.temp > 36)
        return {
          triggered: true, severity: 'warning',
          title: 'High Temperature — Heat Stress Warning',
          message: `Temperature is ${w.temp}°C. Heat exhaustion is likely during outdoor exertion. Vulnerable groups (elderly, children, pregnant) face elevated risk.`,
          healthTip: 'Limit outdoor activity to early morning or evening. Drink water regularly even if not thirsty. Wear light-coloured loose clothing. Check on elderly neighbours.',
          factor: 'Temperature', value: `${w.temp}°C`,
        };
      if (w.temp < -10)
        return {
          triggered: true, severity: 'critical',
          title: 'Extreme Cold — Hypothermia & Frostbite Risk',
          message: `Temperature is ${w.temp}°C. Exposed skin can develop frostbite in minutes. Hypothermia is a life-threatening risk.`,
          healthTip: 'Cover all exposed skin. Wear layered waterproof clothing. Avoid alcohol (increases heat loss). Seek warm shelter immediately if you feel numbness or shivering stops.',
          factor: 'Temperature', value: `${w.temp}°C`,
        };
      if (w.temp < 0)
        return {
          triggered: true, severity: 'warning',
          title: 'Freezing Temperature — Cold Exposure Alert',
          message: `Temperature is ${w.temp}°C below freezing. Ice on surfaces creates fall hazards. Cold air can trigger asthma and cardiac stress in vulnerable people.`,
          healthTip: 'Wear insulated, waterproof footwear. Cover nose and mouth when outdoors. Extra caution for roads and pavements. Keep asthma inhalers accessible.',
          factor: 'Temperature', value: `${w.temp}°C`,
        };
      return null;
    },
  },

  // ── FEELS LIKE / HEAT INDEX ────────────────────────────────────────────────
  {
    category: 'heatIndex',
    emoji: '🔥',
    check: (w) => {
      if (w.feelsLike > 45)
        return {
          triggered: true, severity: 'critical',
          title: 'Dangerous Heat Index',
          message: `Feels like ${w.feelsLike}°C — catastrophic heat index. Heat stroke can occur within 10 minutes of outdoor exposure.`,
          healthTip: 'Absolute emergency heat conditions. Stay indoors. Use all available cooling. Wet sheets, fans, ice packs. Call health helpline if symptoms appear.',
          factor: 'Feels Like', value: `${w.feelsLike}°C`,
        };
      if (w.feelsLike > 38)
        return {
          triggered: true, severity: 'warning',
          title: 'High Heat Index — Outdoor Risk',
          message: `Feels like ${w.feelsLike}°C combined heat and humidity. Physical exertion outdoors is unsafe for most people.`,
          healthTip: 'Reschedule outdoor activities. Keep water intake high. Use sunscreen and light cotton clothing. Monitor children and the elderly closely.',
          factor: 'Feels Like', value: `${w.feelsLike}°C`,
        };
      if (w.feelsLike < -20)
        return {
          triggered: true, severity: 'critical',
          title: 'Extreme Wind Chill',
          message: `Feels like ${w.feelsLike}°C with wind chill. Frostbite can occur in under 5 minutes on exposed skin.`,
          healthTip: 'Do not go outside unless absolutely necessary. Protect every inch of skin. Frostbite starts as numbness and whitening of skin.',
          factor: 'Feels Like', value: `${w.feelsLike}°C`,
        };
      return null;
    },
  },

  // ── UV INDEX ──────────────────────────────────────────────────────────────
  {
    category: 'uv',
    emoji: '☀️',
    check: (w) => {
      const uv = w.uvIndex ?? w.uvIndexDailyMax ?? null;
      if (uv === null) return null;
      if (uv >= 11)
        return {
          triggered: true, severity: 'critical',
          title: 'Extreme UV Radiation',
          message: `UV Index is ${uv} — extreme level. Unprotected skin can burn in under 10 minutes. Long-term exposure at this level causes DNA damage, cataracts, and immune suppression.`,
          healthTip: 'Avoid outdoor exposure 10 AM–4 PM completely. Wear SPF 50+ sunscreen, UV-protective sunglasses, and wide-brim hat. Reapply sunscreen every 90 minutes.',
          factor: 'UV Index', value: `${uv}`,
        };
      if (uv >= 8)
        return {
          triggered: true, severity: 'warning',
          title: 'Very High UV — Skin Protection Required',
          message: `UV Index is ${uv} — very high. Skin damage and sunburn can occur within 20–25 minutes without protection.`,
          healthTip: 'Apply SPF 30+ sunscreen before going out. Wear protective clothing. Seek shade during peak hours. Keep children especially protected.',
          factor: 'UV Index', value: `${uv}`,
        };
      if (uv >= 6)
        return {
          triggered: true, severity: 'info',
          title: 'High UV Index — Sun Protection Advised',
          message: `UV Index is ${uv}. Prolonged outdoor exposure without protection risks sunburn and eye damage.`,
          healthTip: 'Use sunscreen SPF 30+. Wear a hat and sunglasses. Limit peak-hour sun exposure (11 AM–3 PM).',
          factor: 'UV Index', value: `${uv}`,
        };
      return null;
    },
  },

  // ── AIR QUALITY ────────────────────────────────────────────────────────────
  {
    category: 'airQuality',
    emoji: '🌫️',
    check: (w) => {
      const aqi = w.rawAqi ?? w.aqi;
      if (aqi >= 300)
        return {
          triggered: true, severity: 'critical',
          title: 'Hazardous Air Quality',
          message: `AQI is ${aqi} — hazardous. Serious health effects for everyone. Emergency respiratory conditions likely. PM2.5: ${w.advancedData?.pm2_5?.toFixed(0) ?? 'N/A'} µg/m³.`,
          healthTip: 'Stay indoors with windows sealed. Use N95 mask if you must go outside. Avoid all physical activity outdoors. Run air purifiers. Seek medical attention if breathing is difficult.',
          factor: 'AQI', value: `${aqi}`,
        };
      if (aqi >= 200)
        return {
          triggered: true, severity: 'critical',
          title: 'Very Unhealthy Air Quality',
          message: `AQI is ${aqi} — very unhealthy. Health warnings of emergency conditions. Everyone may experience serious effects.`,
          healthTip: 'Avoid all outdoor exertion. Wear N95 mask outdoors. Close windows. Use air purifier. Vulnerable groups (asthma, heart disease) stay indoors.',
          factor: 'AQI', value: `${aqi}`,
        };
      if (aqi >= 150)
        return {
          triggered: true, severity: 'warning',
          title: 'Unhealthy Air Quality',
          message: `AQI is ${aqi} — unhealthy. Everyone begins to experience health effects. Sensitive groups at greater risk.`,
          healthTip: 'Reduce outdoor physical activity. Wear a face mask outdoors. Keep windows closed. Check on asthma patients and elderly.',
          factor: 'AQI', value: `${aqi}`,
        };
      if (aqi >= 101)
        return {
          triggered: true, severity: 'info',
          title: 'Moderate Air Quality Alert',
          message: `AQI is ${aqi} — moderate. Unusually sensitive people may experience minor respiratory symptoms.`,
          healthTip: 'Sensitive groups (asthma, allergies) should limit prolonged outdoor exertion. Others can be active outdoors with normal precautions.',
          factor: 'AQI', value: `${aqi}`,
        };
      return null;
    },
  },

  // ── PM2.5 ─────────────────────────────────────────────────────────────────
  {
    category: 'airQuality',
    emoji: '🏭',
    check: (w) => {
      const pm = w.advancedData?.pm2_5;
      if (!pm) return null;
      if (pm > 150)
        return {
          triggered: true, severity: 'critical',
          title: 'Hazardous PM2.5 Particulates',
          message: `PM2.5 is ${pm.toFixed(0)} µg/m³ — hazardous. Fine particles penetrate deep into lungs and bloodstream, causing cardiovascular and respiratory emergencies.`,
          healthTip: 'Stay indoors with sealed windows. Use HEPA air purifier. Wear N95 mask if going out. Seek emergency care if experiencing chest pain or extreme shortness of breath.',
          factor: 'PM2.5', value: `${pm.toFixed(0)} µg/m³`,
        };
      if (pm > 55)
        return {
          triggered: true, severity: 'warning',
          title: 'High PM2.5 — Respiratory Risk',
          message: `PM2.5 is ${pm.toFixed(0)} µg/m³ — unhealthy range. Long-term exposure at this level increases risk of heart disease, stroke, and lung cancer.`,
          healthTip: 'Reduce outdoor time. Use a face mask. Avoid exercising near busy roads. Run air purifiers in rooms where you spend most time.',
          factor: 'PM2.5', value: `${pm.toFixed(0)} µg/m³`,
        };
      return null;
    },
  },

  // ── CO (CARBON MONOXIDE) ──────────────────────────────────────────────────
  {
    category: 'airQuality',
    emoji: '☠️',
    check: (w) => {
      const co = w.advancedData?.co;
      if (!co) return null;
      // CO in µg/m³; WHO 24-h mean: 4000 µg/m³; short-term risk: >10000
      if (co > 10000)
        return {
          triggered: true, severity: 'critical',
          title: 'High Carbon Monoxide Levels',
          message: `Atmospheric CO is ${(co / 1000).toFixed(1)} mg/m³ — elevated. CO is an odourless toxic gas that reduces blood oxygen, causing headaches, dizziness, and at high levels, death.`,
          healthTip: 'Avoid heavily trafficked areas. Ensure home CO detectors are working. Do not run engines indoors. Leave any enclosed area if you feel headaches or nausea.',
          factor: 'CO', value: `${(co / 1000).toFixed(1)} mg/m³`,
        };
      return null;
    },
  },

  // ── OZONE ─────────────────────────────────────────────────────────────────
  {
    category: 'airQuality',
    emoji: '🛡️',
    check: (w) => {
      const o3 = w.advancedData?.o3;
      if (!o3) return null;
      // WHO 8-hr mean: 100 µg/m³
      if (o3 > 180)
        return {
          triggered: true, severity: 'critical',
          title: 'Dangerous Ground-Level Ozone',
          message: `Ozone (O₃) concentration is ${o3.toFixed(0)} µg/m³. High ground-level ozone irritates the respiratory tract, can trigger asthma attacks, and causes chest pain with deep breaths.`,
          healthTip: 'Avoid outdoor exercise, especially running. Ozone peaks in afternoon — stay indoors then. Those with asthma should keep reliever inhalers close.',
          factor: 'Ozone (O₃)', value: `${o3.toFixed(0)} µg/m³`,
        };
      if (o3 > 120)
        return {
          triggered: true, severity: 'warning',
          title: 'Elevated Ozone — Respiratory Alert',
          message: `Ozone (O₃) is ${o3.toFixed(0)} µg/m³. Sensitive groups may experience coughing, throat irritation, and reduced lung function.`,
          healthTip: 'Limit afternoon outdoor activities. Keep windows closed during peak ozone hours (noon–8 PM). Carry asthma medication.',
          factor: 'Ozone (O₃)', value: `${o3.toFixed(0)} µg/m³`,
        };
      return null;
    },
  },

  // ── POLLEN ────────────────────────────────────────────────────────────────
  {
    category: 'pollen',
    emoji: '🌿',
    check: (w) => {
      const ad = w.advancedData;
      if (!ad) return null;
      const pollenCounts = [
        { name: 'Grass Pollen', val: ad.grass_pollen },
        { name: 'Birch Pollen', val: ad.birch_pollen },
        { name: 'Ragweed Pollen', val: ad.ragweed_pollen },
        { name: 'Mugwort Pollen', val: ad.mugwort_pollen },
        { name: 'Olive Pollen', val: ad.olive_pollen },
        { name: 'Alder Pollen', val: ad.alder_pollen },
      ].filter(p => p.val !== undefined && p.val !== null);

      const highPollenList = pollenCounts.filter(p => (p.val ?? 0) > 50);
      const criticalPollenList = pollenCounts.filter(p => (p.val ?? 0) > 150);

      if (criticalPollenList.length > 0) {
        const top = criticalPollenList[0];
        return {
          triggered: true, severity: 'critical',
          title: `Extreme ${top.name} Count`,
          message: `${top.name} is ${top.val?.toFixed(0)} grains/m³ — extremely high. Severe allergic reactions, asthma attacks, and anaphylaxis are possible in sensitive individuals.`,
          healthTip: 'Stay indoors with windows closed. Take prescribed antihistamines. Wear a mask outdoors. Shower and change clothes after coming inside. Avoid parks and grassy areas.',
          factor: top.name, value: `${top.val?.toFixed(0)} grains/m³`,
        };
      }
      if (highPollenList.length > 0) {
        const top = highPollenList[0];
        return {
          triggered: true, severity: 'warning',
          title: `High ${top.name} Season`,
          message: `${top.name} count is ${top.val?.toFixed(0)} grains/m³. Hay fever, runny nose, watery eyes, and sneezing are likely for allergy sufferers.`,
          healthTip: 'Take antihistamines before going outside. Limit time in parks and gardens. Wear wraparound sunglasses. Change clothes after outdoor activities. Keep car windows closed.',
          factor: top.name, value: `${top.val?.toFixed(0)} grains/m³`,
        };
      }
      return null;
    },
  },

  // ── WIND ──────────────────────────────────────────────────────────────────
  {
    category: 'wind',
    emoji: '🌪️',
    check: (w) => {
      const gusts = w.windGusts ?? w.advancedData?.windGusts;
      const speed = w.windSpeed;
      const displayVal = gusts ? `${speed} km/h (gusts ${gusts} km/h)` : `${speed} km/h`;
      if ((gusts ?? speed) > 100)
        return {
          triggered: true, severity: 'critical',
          title: 'Violent Wind / Storm Conditions',
          message: `Wind speed ${displayVal} — violent storm conditions. Structural damage, flying debris, and uprooted trees are immediate dangers.`,
          healthTip: 'Do NOT go outside. Stay away from windows. Secure loose outdoor items. Follow emergency authority guidance. Avoid elevated structures.',
          factor: 'Wind Speed', value: displayVal,
        };
      if ((gusts ?? speed) > 60)
        return {
          triggered: true, severity: 'warning',
          title: 'Strong Wind Warning',
          message: `Wind speed ${displayVal}. Difficult to walk against wind. Risk of falling branches and unsecured objects becoming projectiles.`,
          healthTip: 'Secure outdoor furniture. Avoid parking under trees. Hold on to structures when walking outdoors. Check roof and garden for loose objects.',
          factor: 'Wind Speed', value: displayVal,
        };
      return null;
    },
  },

  // ── PRECIPITATION ─────────────────────────────────────────────────────────
  {
    category: 'precipitation',
    emoji: '🌧️',
    check: (w) => {
      const precip = w.precipitationSum ?? w.precipitation;
      if (!precip) return null;
      if (precip > 50)
        return {
          triggered: true, severity: 'critical',
          title: 'Extreme Rainfall — Flood Risk',
          message: `Total precipitation is ${precip} mm. Flash flooding, road submersion, and landslides are imminent dangers.`,
          healthTip: 'Avoid all flood-prone areas and underpasses. Do not drive through flooded roads. Move valuables to higher ground. Follow flood authority alerts.',
          factor: 'Precipitation', value: `${precip} mm`,
        };
      if (precip > 20)
        return {
          triggered: true, severity: 'warning',
          title: 'Heavy Rainfall Alert',
          message: `Precipitation is ${precip} mm today. Surface flooding on roads, reduced visibility, and slippery surfaces are likely.`,
          healthTip: 'Use waterproof footwear. Slow down while driving. Avoid low-lying areas near rivers. Check local flood warnings before travelling.',
          factor: 'Precipitation', value: `${precip} mm`,
        };
      return null;
    },
  },

  // ── ATM PRESSURE ──────────────────────────────────────────────────────────
  {
    category: 'pressure',
    emoji: '🔻',
    check: (w) => {
      if (w.pressure < 980)
        return {
          triggered: true, severity: 'warning',
          title: 'Very Low Atmospheric Pressure',
          message: `Pressure is ${w.pressure} hPa — very low. Rapid pressure drops are associated with migraines, joint pain flare-ups, and worsening arthritis. Storm likely.`,
          healthTip: 'Migraine sufferers should take preventive medication. Stay hydrated. Rest if headaches start. Barometric pressure-sensitive people should prepare for discomfort.',
          factor: 'Pressure', value: `${w.pressure} hPa`,
        };
      return null;
    },
  },

  // ── DEW POINT ─────────────────────────────────────────────────────────────
  {
    category: 'dewPoint',
    emoji: '🌊',
    check: (w) => {
      const dp = w.dewPoint;
      if (dp === null || dp === undefined) return null;
      if (dp > 26)
        return {
          triggered: true, severity: 'critical',
          title: 'Extremely Oppressive Humidity (Dew Point)',
          message: `Dew point is ${dp}°C — extremely oppressive. The body cannot cool effectively through sweating. Heat stroke risk surges rapidly during any exertion.`,
          healthTip: 'Remain indoors in air-conditioned spaces. Drink cold water constantly. Avoid any physical exertion. Wear the minimum amount of light clothing.',
          factor: 'Dew Point', value: `${dp}°C`,
        };
      if (dp > 21)
        return {
          triggered: true, severity: 'warning',
          title: 'High Dew Point — Very Uncomfortable',
          message: `Dew point is ${dp}°C — very humid and oppressive. Sweating is ineffective for cooling. Fatigue sets in quickly with minimal exertion.`,
          healthTip: 'Limit outdoor physical activity. Stay in shaded or air-conditioned areas. Increase fluid intake. Wear moisture-wicking, breathable fabrics.',
          factor: 'Dew Point', value: `${dp}°C`,
        };
      return null;
    },
  },

  // ── VISIBILITY ────────────────────────────────────────────────────────────
  {
    category: 'general',
    emoji: '👁️',
    check: (w) => {
      if (w.visibility < 500)
        return {
          triggered: true, severity: 'critical',
          title: 'Near Zero Visibility — Dense Fog/Smog',
          message: `Visibility is only ${w.visibility} m. Road accidents, aviation hazards, and navigation risks are critical. Dense fog or heavy smog.`,
          healthTip: 'Avoid all non-essential travel. If driving: use fog lights, slow down dramatically, increase following distance. Avoid outdoor walks without a companion.',
          factor: 'Visibility', value: `${w.visibility} m`,
        };
      if (w.visibility < 2000)
        return {
          triggered: true, severity: 'warning',
          title: 'Low Visibility Warning',
          message: `Visibility is ${w.visibility} m — significantly reduced. Fog or smog is affecting safe movement outdoors and on roads.`,
          healthTip: 'Drive slowly with headlights on. Allow extra travel time. Wear bright/reflective clothing if walking. Postpone cycling or motorcycle use.',
          factor: 'Visibility', value: `${w.visibility} m`,
        };
      return null;
    },
  },

  // ── VAPOUR PRESSURE DEFICIT ───────────────────────────────────────────────
  {
    category: 'humidity',
    emoji: '🫁',
    check: (w) => {
      const vpd = w.advancedData?.vapourPressureDeficit;
      if (!vpd) return null;
      if (vpd > 4)
        return {
          triggered: true, severity: 'critical',
          title: 'Extreme Vapour Pressure Deficit',
          message: `VPD is ${vpd.toFixed(1)} kPa — extreme atmospheric dryness. Respiratory mucous membranes dry out rapidly, increasing infection susceptibility. Wildfire risk is very high.`,
          healthTip: 'Use indoor humidifiers. Drink water frequently. Apply saline nasal spray. Avoid prolonged outdoor exposure in dry wind.',
          factor: 'Vapour Pressure Deficit', value: `${vpd.toFixed(1)} kPa`,
        };
      if (vpd > 2.5)
        return {
          triggered: true, severity: 'warning',
          title: 'High Vapour Pressure Deficit — Dryness Alert',
          message: `VPD is ${vpd.toFixed(1)} kPa — high atmospheric dryness. Plants and humans experience accelerated moisture loss. Eye and throat irritation are common.`,
          healthTip: 'Increase water intake. Use eye drops if experiencing dryness. Humidify indoor air. Shield skin and lips with moisturising products.',
          factor: 'Vapour Pressure Deficit', value: `${vpd.toFixed(1)} kPa`,
        };
      return null;
    },
  },
];

// ─── Smart Cooldown Manager ───────────────────────────────────────────────────
const COOLDOWN_STORE_KEY  = 'biosentinel_cooldown_v2';
const GLOBAL_SNOOZE_KEY   = 'biosentinel_global_snooze';

interface CategoryRecord {
  lastShownAt:  number;   // ms timestamp when last notification was displayed
  lastValue:    string;   // raw value string for change-significance comparison
  dismissCount: number;   // cumulative user intentional dismissals for this category
}
type CooldownStore = Partial<Record<string, CategoryRecord>>;

const loadStore  = (): CooldownStore => { try { return JSON.parse(localStorage.getItem(COOLDOWN_STORE_KEY) || '{}'); } catch { return {}; } };
const saveStore  = (s: CooldownStore): void => { localStorage.setItem(COOLDOWN_STORE_KEY, JSON.stringify(s)); };

/** Base cooldown window per severity */
const BASE_COOLDOWN_MS: Record<AlertSeverity, number> = {
  critical: 2  * 60 * 60 * 1000,  // 2 h
  warning:  4  * 60 * 60 * 1000,  // 4 h
  info:     10 * 60 * 60 * 1000,  // 10 h
};

/** Absolute minimum gap between same-category notifications (regardless of value change) */
const HARD_FLOOR_MS = 30 * 60 * 1000; // 30 min

/**
 * How much numeric shift is required to consider the value "significantly different".
 * If the shift is large enough AND severity is critical, cooldown can be overridden.
 */
const VALUE_THRESHOLD: Partial<Record<AlertCategory, number>> = {
  humidity:      8,    // % points
  temperature:   3,    // °C
  heatIndex:     3,    // °C
  uv:            2,    // index units
  airQuality:   40,    // AQI
  pollen:       30,    // grains/m³
  wind:         15,    // km/h
  precipitation: 8,    // mm
  pressure:      8,    // hPa
  dewPoint:      3,    // °C
  general:     400,    // m visibility
};

const extractNum = (v: string): number | null => {
  const m = v.match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : null;
};

const isSignificantChange = (cat: AlertCategory, oldVal: string, newVal: string): boolean => {
  const threshold = VALUE_THRESHOLD[cat];
  if (!threshold) return true;
  const o = extractNum(oldVal);
  const n = extractNum(newVal);
  if (o === null || n === null) return oldVal !== newVal;
  return Math.abs(n - o) >= threshold;
};

/** Returns true if this alert should be silently suppressed (too soon / user fed up). */
export const shouldSuppressAlert = (
  category: AlertCategory,
  severity: AlertSeverity,
  currentValue: string
): boolean => {
  // Global snooze (triggered by clear-all)
  const snoozeUntil = Number(localStorage.getItem(GLOBAL_SNOOZE_KEY) ?? 0);
  if (Date.now() < snoozeUntil) return true;

  const store = loadStore();
  const rec   = store[category];
  if (!rec) return false; // never shown before → always allow

  // Dismiss penalty: each intentional dismiss increases the multiplier
  const penaltyMult = rec.dismissCount >= 3 ? 2.5
    : rec.dismissCount === 2 ? 2
    : rec.dismissCount === 1 ? 1.5
    : 1;
  const effectiveCooldown = BASE_COOLDOWN_MS[severity] * penaltyMult;
  const elapsed            = Date.now() - rec.lastShownAt;

  // Hard floor — never repeat within 30 min under any circumstance
  if (elapsed < HARD_FLOOR_MS) return true;

  // Cooldown expired → allow
  if (elapsed >= effectiveCooldown) return false;

  // Within cooldown: allow only for CRITICAL alerts with a significant value shift
  if (severity === 'critical' && isSignificantChange(category, rec.lastValue, currentValue)) return false;

  return true; // suppress
};

/** Call after an alert has been shown to update the cooldown store. */
export const recordAlertShown = (category: AlertCategory, value: string): void => {
  const store = loadStore();
  store[category] = {
    lastShownAt:  Date.now(),
    lastValue:    value,
    dismissCount: store[category]?.dismissCount ?? 0,
  };
  saveStore(store);
};

/** Call when the user intentionally dismisses an alert — increments dismiss count. */
export const recordUserDismiss = (category: AlertCategory): void => {
  const store = loadStore();
  const rec   = store[category];
  store[category] = {
    lastShownAt:  rec?.lastShownAt  ?? Date.now(),
    lastValue:    rec?.lastValue    ?? '',
    dismissCount: (rec?.dismissCount ?? 0) + 1,
  };
  saveStore(store);
};

/** Call when user clicks "Clear All" — snoozes all new alerts for 30 min. */
export const recordUserClearAll = (): void => {
  localStorage.setItem(GLOBAL_SNOOZE_KEY, String(Date.now() + 30 * 60 * 1000));
};

// ─── Main alert generator ─────────────────────────────────────────────────────
/**
 * @param applyCooldown  Pass false for scheduled session briefings so they always
 *                       include the full alert list (added to panel, not as toasts).
 */
export const generateWeatherAlerts = (
  weather: WeatherData,
  session: AlertSession = 'realtime',
  applyCooldown = true
): HealthAlert[] => {
  const alerts: HealthAlert[] = [];
  const now = Date.now();

  for (const rule of ALERT_RULES) {
    try {
      const result = rule.check(weather);
      if (!result || !result.triggered) continue;

      if (applyCooldown && shouldSuppressAlert(rule.category, result.severity, result.value)) {
        continue; // within cooldown and no significant change
      }

      // Record the show event so the cooldown clock starts
      if (applyCooldown) recordAlertShown(rule.category, result.value);

      alerts.push({
        id: uid(),
        severity: result.severity,
        category: rule.category,
        session,
        title: result.title,
        message: result.message,
        healthTip: result.healthTip,
        emoji: rule.emoji,
        factor: result.factor,
        value: result.value,
        timestamp: now,
        read: false,
      });
    } catch (_) { /* ignore rule errors */ }
  }

  // Sort: critical first, then warning, then info
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2));

  return alerts;
};

// ─── Session summary (morning / afternoon / evening briefing) ─────────────────
export const generateSessionBriefing = (
  weather: WeatherData,
  session: AlertSession
): HealthAlert => {
  const now = Date.now();
  const greetings: Record<string, string> = {
    morning: '🌅 Good morning',
    afternoon: '☀️ Good afternoon',
    evening: '🌙 Good evening',
  };
  const hints: Record<string, string> = {
    morning: 'Plan your day with these current conditions in mind.',
    afternoon: 'Conditions update — adjust your afternoon activities accordingly.',
    evening: 'Evening briefing — prepare for overnight and tomorrow.',
  };
  const emoji = session === 'morning' ? '🌅' : session === 'afternoon' ? '☀️' : '🌙';

  const uvInfo = weather.uvIndex !== null && weather.uvIndex !== undefined
    ? ` UV Index: ${weather.uvIndex}.` : '';
  const pollenNote = (weather.advancedData?.grass_pollen ?? 0) > 30 ? ' Pollen is elevated today.' : '';

  return {
    id: uid(),
    severity: 'info',
    category: 'general',
    session,
    title: `${greetings[session] ?? '👋 Hello'} — ${session.charAt(0).toUpperCase() + session.slice(1)} Health Briefing`,
    message: `${weather.city}: ${weather.temp}°C, feels like ${weather.feelsLike}°C, humidity ${weather.humidity}%, AQI ${weather.rawAqi ?? weather.aqi}.${uvInfo}${pollenNote} ${hints[session] ?? ''}`,
    healthTip: `${weather.todaySummary}`,
    emoji,
    factor: 'Daily Briefing',
    value: `${weather.temp}°C`,
    timestamp: now,
    read: false,
  };
};

// ─── Browser Notification helper (rate-limited) ───────────────────────────────
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
};

// In-memory sliding window: timestamps of last N browser notifications sent
const _browserNotifLog: number[] = [];
const BROWSER_NOTIF_MAX  = 3;            // max 3 browser pushes
const BROWSER_NOTIF_WINDOW = 10 * 60 * 1000; // per 10-minute window

/**
 * Send a browser push notification with a rate-cap of 3/10-min.
 * Uses alert.category as the notification tag so same-category notifications
 * replace each other in the OS tray instead of stacking.
 */
export const sendBrowserNotification = (alert: HealthAlert): void => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = Date.now();
  // Prune timestamps outside the window
  while (_browserNotifLog.length && now - _browserNotifLog[0] > BROWSER_NOTIF_WINDOW) {
    _browserNotifLog.shift();
  }
  if (_browserNotifLog.length >= BROWSER_NOTIF_MAX) return; // rate cap hit

  _browserNotifLog.push(now);
  const prefix = alert.severity === 'critical' ? '🚨 CRITICAL — '
    : alert.severity === 'warning' ? '⚠️ '
    : 'ℹ️ ';
  try {
    const title = notificationPlainText(alert.title, 400);
    const body = notificationPlainText(alert.message, 2000);
    new Notification(`${prefix}${title}`, {
      body: body.length > 150 ? body.slice(0, 147) + '…' : body,
      icon: '/favicon.ico',
      tag: alert.category,           // same-category notifs replace, not stack
      requireInteraction: alert.severity === 'critical',
    });
  } catch (_) { /* some environments block notifications */ }
};

// ─── Schedule key: identifies the last sent session per day ───────────────────
const SCHEDULE_KEY = 'biosentinel_alert_schedule';

interface ScheduleRecord {
  date: string;      // YYYY-MM-DD
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
}

const todayStr = (utcOffsetSeconds = 0) => {
  const d = new Date(Date.now() + utcOffsetSeconds * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export const shouldSendScheduledAlert = (
  session: 'morning' | 'afternoon' | 'evening',
  utcOffsetSeconds = 0
): boolean => {
  const today = todayStr(utcOffsetSeconds);
  const raw = localStorage.getItem(SCHEDULE_KEY);
  let record: ScheduleRecord = { date: today, morning: false, afternoon: false, evening: false };
  if (raw) {
    try { record = JSON.parse(raw); } catch (_) { /* default record */ }
  }
  if (record.date !== today) {
    // New day — reset
    record = { date: today, morning: false, afternoon: false, evening: false };
  }
  return !record[session];
};

export const markScheduledAlertSent = (
  session: 'morning' | 'afternoon' | 'evening',
  utcOffsetSeconds = 0
): void => {
  const today = todayStr(utcOffsetSeconds);
  const raw = localStorage.getItem(SCHEDULE_KEY);
  let record: ScheduleRecord = { date: today, morning: false, afternoon: false, evening: false };
  if (raw) {
    try { record = JSON.parse(raw); } catch (_) { /* default record */ }
  }
  if (record.date !== today) {
    record = { date: today, morning: false, afternoon: false, evening: false };
  }
  record[session] = true;
  record.date = today;
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(record));
};
