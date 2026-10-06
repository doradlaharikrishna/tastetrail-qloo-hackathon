const form = document.querySelector("#planner-form");
const cityInput = document.querySelector("#city");
const citySuggestions = document.querySelector("#city-suggestions");
const peopleGrid = document.querySelector("#people-grid");
const rememberInput = document.querySelector("#remember-table");
const recommendations = document.querySelector("#recommendations");
const context = document.querySelector("#results-context");
const toast = document.querySelector("#toast");
const submitButton = form.querySelector("button[type='submit']");
const resultBadge = document.querySelector("#result-badge");
const modePill = document.querySelector("#mode-pill");
const refreshButton = document.querySelector("#refresh-button");
const addPersonButton = document.querySelector("#add-person");
const exampleButton = document.querySelector("#example-button");
const tableStorageKey = "common-table-profile-v1";
let toastTimer;
let lastRequest = null;
let lastPlan = null;
let citySearchTimer;
let citySearchController;
let activeCitySuggestion = -1;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function memberCard(person = {}) {
  const number = peopleGrid.children.length + 1;
  const name = escapeHtml(person.name || (number === 1 ? "You" : number === 2 ? "Lunch buddy" : `Person ${number}`));
  const favorites = escapeHtml(Array.isArray(person.favorites) ? person.favorites.join(", ") : person.favorites || "");
  const card = document.createElement("article");
  card.className = "person-card";
  card.innerHTML = `<div class="person-top"><span class="person-avatar" aria-hidden="true">${number.toString().padStart(2, "0")}</span><label class="person-name-label">Name <input class="person-name" maxlength="40" value="${name}" aria-label="Person ${number} name" /></label><button class="remove-person" type="button" aria-label="Remove person ${number}" ${number <= 2 ? "disabled" : ""}>×</button></div><label class="person-taste-label">Taste anchors<input class="person-favorites" maxlength="240" value="${favorites}" placeholder="e.g. Virat Kohli, Succession" aria-label="Person ${number} taste anchors" required /></label><span class="person-hint">Separate a few favorites with commas</span>`;
  card.querySelector(".remove-person").addEventListener("click", () => {
    if (peopleGrid.children.length <= 2) return;
    card.remove();
    refreshMemberControls();
    saveTable();
  });
  for (const field of card.querySelectorAll("input")) field.addEventListener("input", saveTable);
  return card;
}

function refreshMemberControls() {
  const cards = [...peopleGrid.children];
  cards.forEach((card, index) => {
    card.querySelector(".person-avatar").textContent = String(index + 1).padStart(2, "0");
    card.querySelector(".person-name").setAttribute("aria-label", `Person ${index + 1} name`);
    card.querySelector(".person-favorites").setAttribute("aria-label", `Person ${index + 1} taste anchors`);
    const removeButton = card.querySelector(".remove-person");
    removeButton.disabled = cards.length <= 2;
    removeButton.setAttribute("aria-label", `Remove person ${index + 1}`);
  });
  addPersonButton.disabled = cards.length >= 4;
}

function collectTable() {
  return [...peopleGrid.children].map((card, index) => ({
    name: card.querySelector(".person-name").value.trim() || `Person ${index + 1}`,
    favorites: card.querySelector(".person-favorites").value.split(",").map((favorite) => favorite.trim()).filter(Boolean).slice(0, 3)
  }));
}

function saveTable() {
  if (!rememberInput.checked) {
    localStorage.removeItem(tableStorageKey);
    return;
  }
  try { localStorage.setItem(tableStorageKey, JSON.stringify({ city: cityInput.value.trim(), participants: collectTable() })); } catch {}
}

function loadTable() {
  try {
    const saved = JSON.parse(localStorage.getItem(tableStorageKey) || "null");
    if (!saved) return false;
    if (typeof saved.city === "string" && saved.city) cityInput.value = saved.city;
    const participants = Array.isArray(saved.participants) ? saved.participants.slice(0, 4) : [];
    if (participants.length >= 2) {
      peopleGrid.replaceChildren();
      participants.forEach((participant) => peopleGrid.append(memberCard(participant)));
      refreshMemberControls();
    }
    return true;
  } catch { return false; }
}

addPersonButton.addEventListener("click", () => {
  if (peopleGrid.children.length >= 4) return;
  peopleGrid.append(memberCard());
  refreshMemberControls();
  saveTable();
  peopleGrid.lastElementChild.querySelector(".person-name").focus();
});

rememberInput.addEventListener("change", () => {
  if (rememberInput.checked) {
    localStorage.setItem("common-table-remember", "true");
    saveTable();
  } else {
    localStorage.removeItem("common-table-remember");
    localStorage.removeItem(tableStorageKey);
  }
});
cityInput.addEventListener("input", saveTable);

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
  saveTable();
}

function renderCitySuggestions(cities) {
  if (!cities.length) return closeCitySuggestions();
  citySuggestions.innerHTML = cities.map((city, index) => `<button class="city-suggestion" id="city-option-${index}" type="button" role="option" aria-selected="false" data-city-value="${escapeHtml(city.value)}"><span class="city-suggestion-name">${escapeHtml(city.name)}</span>${city.details ? `<span class="city-suggestion-details">${escapeHtml(city.details)}</span>` : ""}</button>`).join("");
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
    } catch (error) { if (error.name !== "AbortError") closeCitySuggestions(); }
  }, 280);
});

cityInput.addEventListener("keydown", (event) => {
  if (citySuggestions.hidden) return;
  const options = citySuggestions.querySelectorAll('[role="option"]');
  if (event.key === "ArrowDown" && options.length) { event.preventDefault(); setActiveCitySuggestion(activeCitySuggestion + 1); }
  else if (event.key === "ArrowUp" && options.length) { event.preventDefault(); setActiveCitySuggestion(activeCitySuggestion < 0 ? options.length - 1 : activeCitySuggestion - 1); }
  else if (event.key === "Enter" && activeCitySuggestion >= 0) { event.preventDefault(); chooseCitySuggestion({ value: options[activeCitySuggestion].dataset.cityValue }); }
  else if (event.key === "Escape") closeCitySuggestions();
});
citySuggestions.addEventListener("mousedown", (event) => event.preventDefault());
citySuggestions.addEventListener("click", (event) => {
  const option = event.target.closest('[role="option"]');
  if (option) chooseCitySuggestion({ value: option.dataset.cityValue });
});
document.addEventListener("click", (event) => { if (!event.target.closest(".city-control")) closeCitySuggestions(); });

function renderPlan(plan) {
  lastPlan = plan;
  const places = plan.places || [];
  if (!places.length) {
    recommendations.innerHTML = `<div class="empty-state"><span>✳</span><strong>Ready for the first shared lunch?</strong><p>Try the live example above, or add each person's taste anchors to find a real overlap.</p></div>`;
    resultBadge.textContent = plan.mode === "preview" ? "PREVIEW ONLY" : "READY WHEN YOU ARE";
    context.textContent = `Your table in ${plan.city || cityInput.value} is set up. Find places both people already have a Qloo affinity for.`;
    refreshButton.hidden = true;
    return;
  }
  const people = plan.participantNames || (plan.matchedFavorites || []).map((item) => item.name);
  recommendations.innerHTML = places.map((place, index) => {
    const scores = place.affinityByParticipant || [];
    const scoreRows = scores.map(({ name, score, signals }) => `<div class="score-row"><span><i></i>${escapeHtml(name)}</span><strong>${Number(score).toFixed(2)}</strong>${signals?.length ? `<small>taste: ${escapeHtml(signals.join(", "))}</small>` : ""}</div>`).join("");
    const tags = (place.tags || []).map((tag) => `<span class="place-tag">${escapeHtml(tag)}</span>`).join("");
    const percent = Math.round(Number(place.balancedFit || 0) * 100);
    return `<article class="rec-card"><div class="rec-topline"><span class="rec-type">COMMON PICK <b>0${index + 1}</b></span><span class="fair-score" aria-label="Group fit ${place.balancedFit.toFixed(2)} out of 1"><strong>${escapeHtml(place.balancedFit.toFixed(2))}</strong><small>GROUP FIT</small></span></div><h3 class="rec-title">${escapeHtml(place.name)}</h3><p class="rec-meta"><span>RESTAURANT</span><i>·</i>${escapeHtml(place.location || plan.city)}</p><div class="fit-meter" role="img" aria-label="Group fit ${percent} percent"><span style="width:${Math.min(100, percent)}%"></span></div><p class="score-caption">Qloo fit for each person · higher is stronger</p><div class="score-list">${scoreRows}</div>${tags ? `<div class="place-tags">${tags}</div>` : ""}<a class="rec-link" href="${escapeHtml(place.url)}" target="_blank" rel="noreferrer">Find this place on Maps <span aria-hidden="true">↗</span></a></article>`;
  }).join("");
  resultBadge.textContent = "LIVE QLOO OVERLAP";
  context.textContent = `${places.length} restaurant${places.length === 1 ? "" : "s"} surfaced for ${people.join(" + ")} in ${plan.city}. Every pick appeared in each person’s separate Qloo results.`;
  refreshButton.hidden = false;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

async function requestPlan(request, excludeIds = []) {
  submitButton.disabled = true;
  submitButton.querySelector("span:first-child").textContent = "Finding the overlap…";
  refreshButton.disabled = true;
  try {
    const response = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, excludeIds }) });
    const plan = await response.json();
    if (!response.ok) throw new Error(plan.error || "The shared lunch planner couldn’t finish that request.");
    renderPlan(plan);
    document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    if (plan.mode === "preview") showToast("The app is in preview mode. Connect the Qloo key on the server for live matches.");
  } catch (error) { showToast(error.message || "Couldn’t reach Common Table. Please try again."); }
  finally {
    submitButton.disabled = false;
    refreshButton.disabled = false;
    submitButton.querySelector("span:first-child").textContent = "Find our overlap";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  const participants = collectTable();
  if (!city) { cityInput.focus(); return; }
  const missing = participants.findIndex((person) => !person.favorites.length);
  if (missing >= 0) { peopleGrid.children[missing].querySelector(".person-favorites").focus(); showToast("Add at least one favorite for every person at the table."); return; }
  lastRequest = { city, participants };
  saveTable();
  requestPlan(lastRequest);
});

refreshButton.addEventListener("click", () => {
  if (!lastRequest || !lastPlan?.places?.length) return;
  requestPlan(lastRequest, lastPlan.places.map((place) => place.id).filter(Boolean));
});

exampleButton.addEventListener("click", () => {
  cityInput.value = "Bengaluru";
  rememberInput.checked = false;
  localStorage.removeItem("common-table-remember");
  localStorage.removeItem(tableStorageKey);
  peopleGrid.replaceChildren();
  peopleGrid.append(memberCard({ name: "You", favorites: ["Virat Kohli"] }), memberCard({ name: "Taylor", favorites: ["Taylor Swift"] }));
  refreshMemberControls();
  lastRequest = { city: "Bengaluru", participants: collectTable() };
  requestPlan(lastRequest);
});

fetch("/api/health").then((response) => response.json()).then(({ mode }) => {
  modePill.innerHTML = mode === "live" ? "<i></i> Qloo live" : "<i></i> Preview mode";
  if (mode === "live") modePill.classList.add("live-mode");
}).catch(() => { modePill.innerHTML = "<i></i> Qloo status unavailable"; });

peopleGrid.append(memberCard({ name: "You", favorites: "" }), memberCard({ name: "Lunch buddy", favorites: "" }));
refreshMemberControls();
rememberInput.checked = localStorage.getItem("common-table-remember") === "true";
if (rememberInput.checked) loadTable();
renderPlan({ mode: "ready", city: cityInput.value, places: [] });
