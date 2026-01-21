// --- CONFIG ---
const FIELD_LAT = 52.24;
const FIELD_LON = -2.18;

const OPENWEATHER_API_KEY = "4bc4ece07478293baab440e53b9c5a45";

const CURRENT_URL = `https://api.openweathermap.org/data/2.5/weather?lat=${FIELD_LAT}&lon=${FIELD_LON}&units=metric&appid=${OPENWEATHER_API_KEY}`;
const FORECAST_URL = `https://api.openweathermap.org/data/2.5/forecast?lat=${FIELD_LAT}&lon=${FIELD_LON}&units=metric&appid=${OPENWEATHER_API_KEY}`;
const UK_ALERTS_URL = "https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/UK";

// Simple rugging thresholds (you can tweak these)
const RUG_RULES = {
  mild: {
    minTemp: 8, // above this, usually no rug needed
  },
  cool: {
    minTemp: 4, // 4–8°C, maybe light rug if wet/windy
  },
  cold: {
    minTemp: -2, // -2–4°C, likely rug, especially foals
  },
  veryCold: {
    minTemp: -100, // below -2°C
  },
};

async function loadWeather() {
  try {
    // Fetch current weather
    const currentRes = await fetch(CURRENT_URL);
    const current = await currentRes.json();

    // Fetch forecast
    const forecastRes = await fetch(FORECAST_URL);
    const forecast = await forecastRes.json();

    // Fetch UK alerts (RSS feed)
    const alertsRes = await fetch(UK_ALERTS_URL);
    const alertsText = await alertsRes.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(alertsText, "text/xml");
    const items = xml.querySelectorAll("item");
    const alerts = Array.from(items).map(item => ({
      title: item.querySelector("title")?.textContent || "Alert",
      description: item.querySelector("description")?.textContent || "",
      link: item.querySelector("link")?.textContent || ""
    }));

    // --- Update UI ---

    // Current weather
    document.getElementById("location-name").textContent = "Foal field (WR3–WR9 area)";
    document.getElementById("temp").textContent = Math.round(current.main.temp);
    document.getElementById("feels-like").textContent = Math.round(current.main.feels_like);
    document.getElementById("description").textContent = current.weather[0].description;

    const windMps = current.wind.speed;
    const gustMps = current.wind.gust || 0;
    const windMph = windMps * 2.23694;
    const gustMph = gustMps * 2.23694;

    document.getElementById("wind-speed").textContent = windMph.toFixed(1);
    document.getElementById("wind-gust").textContent = gustMph.toFixed(1);

    const rain1h = current.rain?.["1h"] || 0;
    const snow1h = current.snow?.["1h"] || 0;
    document.getElementById("rain-1h").textContent = (rain1h + snow1h).toFixed(1);

    const isNight = current.weather[0].icon.includes("n");
    const iconChar = weatherIconFromCode(current.weather[0].id, isNight);
    document.getElementById("weather-icon").textContent = iconChar;

    // Rugging advice
    const rug = getRugAdvice({
      temp: current.main.temp,
      feels_like: current.main.feels_like,
      wind_speed: windMph,
      rain: current.rain,
      snow: current.snow,
    });

    const rugEl = document.getElementById("rug-advice");
    rugEl.textContent = rug.advice;
    rugEl.classList.remove("caution", "danger");
    if (rug.level === "caution") rugEl.classList.add("caution");
    if (rug.level === "danger") rugEl.classList.add("danger");

    // Alerts
    renderAlerts(alerts);

    // Severity map
    const feels = current.main.feels_like;
    const wetScore = rain1h + snow1h > 0 ? 1 : 0;
    const windScore = windMph / 20;
    let tempScore = 0;

    if (feels < 8 && feels >= 4) tempScore = 1;
    else if (feels < 4 && feels >= -2) tempScore = 2;
    else if (feels < -2) tempScore = 3;

    const severityScore = tempScore + windScore + wetScore;
    const color = severityColor(severityScore);

    severityCircle.setStyle({ color, fillColor: color });

    // Hourly forecast (next 12 hours from 3‑hour blocks)
    const nextHours = forecast.list.slice(0, 4); // 4 × 3h = 12h
    renderHourly(nextHours, 0);

  } catch (err) {
    console.error(err);
    alert("Could not load weather. Check your API key or internet connection.");
  }
}


// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  loadWeather();
  // Refresh every 10 minutes
  setInterval(loadWeather, 10 * 60 * 1000);
});