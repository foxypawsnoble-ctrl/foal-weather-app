// --- CONFIG ---
const FIELD_LAT = 52.24;
const FIELD_LON = -2.18;

const OPENWEATHER_API_KEY = "4bc4ece07478293baab440e53b9c5a45";

const CURRENT_URL = `https://api.openweathermap.org/data/2.5/weather?lat=${FIELD_LAT}&lon=${FIELD_LON}&units=metric&appid=${OPENWEATHER_API_KEY}`;
const FORECAST_URL = `https://api.openweathermap.org/data/2.5/forecast?lat=${FIELD_LAT}&lon=${FIELD_LON}&units=metric&appid=${OPENWEATHER_API_KEY}`;
const UK_ALERTS_URL = "https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/UK";


// --- MAP SETUP ---
let map;
let severityCircle;

function initMap() {
  map = L.map("map").setView([FIELD_LAT, FIELD_LON], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  severityCircle = L.circle([FIELD_LAT, FIELD_LON], {
    radius: 300,
    color: "#888",
    fillColor: "#888",
    fillOpacity: 0.5,
  }).addTo(map);
}


// --- WEATHER ICONS ---
function weatherIconFromCode(code, isNight) {
  if (code >= 200 && code < 300) return "⛈️";
  if (code >= 300 && code < 500) return "🌦️";
  if (code >= 500 && code < 600) return "🌧️";
  if (code >= 600 && code < 700) return "❄️";
  if (code >= 700 && code < 800) return "🌫️";
  if (code === 800) return isNight ? "🌕" : "☀️";
  if (code > 800) return "☁️";
  return "🌡️";
}


// --- RUGGING ADVICE ---
const RUG_RULES = {
  mild: { minTemp: 8 },
  cool: { minTemp: 4 },
  cold: { minTemp: -2 },
  veryCold: { minTemp: -100 },
};

function getRugAdvice({ temp, feels_like, wind_speed, rain, snow }) {
  const wet = rain || snow ? true : false;

  if (feels_like >= RUG_RULES.mild.minTemp && !wet) {
    return { advice: "No rug needed", level: "normal" };
  }

  if (feels_like >= RUG_RULES.cool.minTemp) {
    return wet
      ? { advice: "Light rug if foals are wet", level: "caution" }
      : { advice: "Light rug optional", level: "normal" };
  }

  if (feels_like >= RUG_RULES.cold.minTemp) {
    return { advice: "Medium rug recommended", level: "caution" };
  }

  return { advice: "Heavy rug recommended", level: "danger" };
}


// --- ALERTS ---
function renderAlerts(alerts) {
  const container = document.getElementById("alerts");
  container.innerHTML = "";

  if (!alerts.length) {
    container.innerHTML = "<p>No active weather alerts.</p>";
    return;
  }

  alerts.forEach(a => {
    const div = document.createElement("div");
    div.className = "alert";
    div.innerHTML = `<strong>${a.title}</strong><br>${a.description}`;
    container.appendChild(div);
  });
}


// --- SEVERITY COLOUR ---
function severityColor(score) {
  if (score < 1.5) return "#4CAF50";   // green
  if (score < 3) return "#FFC107";     // amber
  return "#F44336";                    // red
}


// --- HOURLY FORECAST ---
function renderHourly(hours) {
  const container = document.getElementById("hourly");
  container.innerHTML = "";

  hours.forEach(h => {
    const time = new Date(h.dt * 1000).getHours();
    const temp = Math.round(h.main.temp);
    const icon = weatherIconFromCode(h.weather[0].id, false);

    const div = document.createElement("div");
    div.className = "hour-block";
    div.innerHTML = `<strong>${time}:00</strong><br>${icon}<br>${temp}°C`;
    container.appendChild(div);
  });
}


// --- MAIN WEATHER LOADER ---
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


    // Hourly forecast (next 12 hours)
    const nextHours = forecast.list.slice(0, 4);
    renderHourly(nextHours);

  } catch (err) {
    console.error(err);
    alert("Could not load weather. Check your API key or internet connection.");
  }
}


// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);
});