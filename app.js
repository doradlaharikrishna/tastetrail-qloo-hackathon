const form = document.querySelector("#planner-form");
const cityInput = document.querySelector("#city");
const citySuggestions = document.querySelector("#city-suggestions");
const favoritesInput = document.querySelector("#favorites");
const occasionInput = document.querySelector("#occasion");
const recommendations = document.querySelector("#recommendations");
const context = document.querySelector("#results-context");
const toast = document.querySelector("#toast");
const submitButton = form.querySelector("button[type='submit']");
const resultBadge = document.querySelector("#result-badge");
const resultsNote = document.querySelector("#results-note");
const modePill = document.querySelector("#mode-pill");
const refreshButton = document.querySelector("#refresh-button");
let toastTimer;
let lastRequest = null;
let lastTrail = null;
let citySearchTimer;
let citySearchController;
let activeCitySuggestion = -1;

function closeCitySuggestions() {
  citySuggestions.hidden = true;
  citySuggestions.replaceChildren();
  cityInput.setAttribute("aria-expanded", "false");
  cityInput.removeAttribute("aria-activedescendant");
  activeCitySuggestion = -1;
}

function setActiveCitySuggestion(index) {
  const options = [...citySuggestions.querySelectorAll('[role="option"]')];
  if (!options.length) return;
  activeCitySuggestion = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === activeCitySuggestion;
    option.setAttribute("aria-selected", String(active));
    option.classList.toggle("active", active);
  });
  cityInput.setAttribute("aria-activedescendant", options[activeCitySuggestion].id);
  options[activeCitySuggestion].scrollIntoView({ block: "nearest" });
}

function chooseCitySuggestion(city) {
  cityInput.value = city.value;
  closeCitySuggestions();
}

function renderCitySuggestions(cities) {
  if (!cities.length) {
    closeCitySuggestions();
    return;
  }
  citySuggestions.innerHTML = cities.map((city, index) => `
    <button class="city-suggestion" id="city-option-${index}" type="button" role="option" aria-selected="false" data-city-value="${escapeHtml(city.value)}">
      <span class="city-suggestion-name">${escapeHtml(city.name)}</span>
      ${city.details ? `<span class="city-suggestion-details">${escapeHtml(city.details)}</span>` : ""}
    </button>
  `).join("");
  citySuggestions.hidden = false;
  cityInput.setAttribute("aria-expanded", "true");
  activeCitySuggestion = -1;
}

cityInput.addEventListener("input", () => {
  window.clearTimeout(citySearchTimer);
  citySearchController?.abort();
  closeCitySuggestions();
  const query = cityInput.value.trim();
  if (query.length < 2) return;

  citySearchTimer = window.setTimeout(async () => {
    const controller = new AbortController();
    citySearchController = controller;
    try {
      const response = await fetch(`/api/cities?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!response.ok) return;
      const { cities } = await response.json();
      if (!controller.signal.aborted && cityInput.value.trim() === query) renderCitySuggestions(cities || []);
    } catch (error) {
      if (error.name !== "AbortError") closeCitySuggestions();
    }
  }, 300);
});

cityInput.addEventListener("keydown", (event) => {
  if (citySuggestions.hidden) return;
  const options = citySuggestions.querySelectorAll('[role="option"]');
  if (event.key === "ArrowDown" && options.length) {
    event.preventDefault();
    setActiveCitySuggestion(activeCitySuggestion + 1);
  } else if (event.key === "ArrowUp" && options.length) {
    event.preventDefault();
    setActiveCitySuggestion(activeCitySuggestion < 0 ? options.length - 1 : activeCitySuggestion - 1);
  } else if (event.key === "Enter" && activeCitySuggestion >= 0) {
    event.preventDefault();
    chooseCitySuggestion({ value: options[activeCitySuggestion].dataset.cityValue });
  } else if (event.key === "Escape") {
    closeCitySuggestions();
  }
});

citySuggestions.addEventListener("mousedown", (event) => event.preventDefault());
citySuggestions.addEventListener("click", (event) => {
  const option = event.target.closest('[role="option"]');
  if (option) chooseCitySuggestion({ value: option.dataset.cityValue });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".city-control")) closeCitySuggestions();
});

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function renderTrail(trail) {
  const city = escapeHtml(trail.city || cityInput.value.trim());
  const favorites = (trail.matchedFavorites || []).map(escapeHtml);
  const places = trail.places || [];
  const isLive = trail.mode === "live";
  lastTrail = trail;

  recommendations.innerHTML = places.map((place, index) => `
    <article class="rec-card">
      <div class="rec-topline"><span class="rec-type">${isLive ? `Qloo pick ${index + 1}` : `Sample pick ${index + 1}`}</span></div>
      <h3 class="rec-title">${escapeHtml(place.name || "A local favorite")}</h3>
      <p class="rec-meta">${escapeHtml(place.kind || "Place")} <span aria-hidden="true">·</span> ${escapeHtml(place.location || city)}</p>
      <p class="rec-reason"><strong>${isLive ? "Why it surfaced" : "A taste connection"}</strong> ${escapeHtml(place.reason || "A sample idea for your night out.")}</p>
      ${place.url ? `<a class="rec-link" href="${escapeHtml(place.url)}" target="_blank" rel="noreferrer">Explore this place <span aria-hidden="true">↗</span></a>` : ""}
    </article>
  `).join("");

  if (isLive && favorites.length) {
    context.textContent = `${escapeHtml(trail.occasion || "A little of everything")} in ${city} · Qloo matched ${favorites.join(", ")} to nearby places.`;
    resultBadge.textContent = "QLOO-POWERED PICKS";
    resultsNote.innerHTML = "<strong>Live taste matching.</strong> These places were ranked with your resolved Qloo taste signals and the location you chose.";
    refreshButton.hidden = false;
  } else {
    context.textContent = `Sample ideas for a night out in ${city} — live taste matching isn’t connected yet.`;
    resultBadge.textContent = "SAMPLE PICKS";
    resultsNote.innerHTML = "<strong>Preview only.</strong> Sample recommendations are not live Qloo results.";
    refreshButton.hidden = true;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

async function requestTrail(request, excludeIds = []) {
  submitButton.disabled = true;
  submitButton.querySelector("span:first-child").textContent = "Finding your night…";
  refreshButton.disabled = true;
  try {
    const response = await fetch("/api/trail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, excludeIds })
    });
    const trail = await response.json();
    if (!response.ok) throw new Error(trail.error || "The planner couldn’t finish that request.");
    renderTrail(trail);
    document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    if (trail.mode === "preview") showToast("Preview only: no API key is configured on the server yet.");
  } catch (error) {
    showToast(error.message || "Couldn’t reach TasteTrail. Start the local server and try again.");
  } finally {
    submitButton.disabled = false;
    refreshButton.disabled = false;
    submitButton.querySelector("span:first-child").textContent = "Find my night";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (window.location.protocol === "file:") {
    showToast("Start TasteTrail with npm start, then open http://localhost:3000 to use the planner.");
    return;
  }
  const city = cityInput.value.trim();
  if (!city) {
    cityInput.focus();
    return;
  }
  lastRequest = {
    city,
    favorites: favoritesInput.value.split(",").map((favorite) => favorite.trim()).filter(Boolean).slice(0, 4),
    occasion: occasionInput.value
  };
  requestTrail(lastRequest);
});

refreshButton.addEventListener("click", () => {
  if (!lastRequest || !lastTrail?.places?.length) return;
  requestTrail(lastRequest, lastTrail.places.map((place) => place.id).filter(Boolean));
});

fetch("/api/health")
  .then((response) => response.json())
  .then(({ mode }) => {
    if (mode === "live") {
      modePill.innerHTML = '<span class="pulse-dot"></span> Qloo key configured';
      modePill.classList.add("live-mode");
    }
  })
  .catch(() => {});

renderTrail({
  mode: "preview",
  city: cityInput.value,
  places: [
    { name: "The candlelit table", kind: "Dinner · Japanese comfort food", reason: "A familiar favorite, with a menu that leaves room to explore." },
    { name: "A listening room", kind: "Music · Live jazz", reason: "For the part of your taste that likes to slow down and listen." },
    { name: "One last little pour", kind: "Drinks · Natural wine bar", reason: "Easygoing, low-lit, and just a few blocks from the music." }
  ]
});
