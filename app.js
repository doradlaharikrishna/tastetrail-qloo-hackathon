const form = document.querySelector("#planner-form");
const cityInput = document.querySelector("#city");
const citySuggestions = document.querySelector("#city-suggestions");
const peopleGrid = document.querySelector("#people-grid");
const rememberInput = document.querySelector("#remember-table");
const recommendations = document.querySelector("#recommendations");
const results = document.querySelector("#results");
const resultsNote = document.querySelector("#results-note");
const context = document.querySelector("#results-context");
const toast = document.querySelector("#toast");
const groqAssistInput = document.querySelector("#groq-assist");
const matchReview = document.querySelector("#match-review");
const matchSuggestions = document.querySelector("#match-suggestions");
const submitButton = form.querySelector("button[type='submit']");
const resultBadge = document.querySelector("#result-badge");
const refreshButton = document.querySelector("#refresh-button");
const addPersonButton = document.querySelector("#add-person");
const tableStorageKey = "common-table-profile-v1";
let toastTimer;
let lastRequest = null;
let lastPlan = null;
let citySearchTimer;
let citySearchController;
let activeCitySuggestion = -1;
let pendingMatches = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function memberCard(person = {}) {
  const number = peopleGrid.children.length + 1;
  const name = escapeHtml(person.name || (number === 1 ? "You" : number === 2 ? "Lunch buddy" : `Person ${number}`));
  const favorites = escapeHtml(Array.isArray(person.favorites) ? person.favorites.join(", ") : person.favorites || "");
  const diningPreferences = escapeHtml(Array.isArray(person.diningPreferences) ? person.diningPreferences.join(", ") : person.diningPreferences || "");
  const card = document.createElement("article");
  card.className = "person-card";
  card.innerHTML = `<div class="person-top"><span class="person-avatar" aria-hidden="true">${number.toString().padStart(2, "0")}</span><label class="person-name-label">Name <input class="person-name" maxlength="40" value="${name}" aria-label="Person ${number} name" /></label><button class="remove-person" type="button" aria-label="Remove person ${number}" ${number <= 2 ? "disabled" : ""}>×</button></div><label class="person-taste-label">Specific names they already like<input class="person-favorites" maxlength="240" value="${favorites}" placeholder="e.g. Virat Kohli, Taylor Swift" aria-label="Person ${number} taste anchors" required /></label><span class="person-hint">Named people, artists, films, brands, or places Qloo can identify.</span><label class="person-dining-label">Food & dining preferences<input class="person-dining" maxlength="240" value="${diningPreferences}" placeholder="e.g. biryani, spicy, quiet atmosphere" aria-label="Person ${number} food and dining preferences" /></label><span class="person-hint">Supported Qloo tags can influence ranking. Portion and menu details are not verified.</span>`;
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
    card.querySelector(".person-favorites").setAttribute("aria-label", `Person ${index + 1} favorites`);
    card.querySelector(".person-dining").setAttribute("aria-label", `Person ${index + 1} food and dining preferences`);
    const removeButton = card.querySelector(".remove-person");
    removeButton.disabled = cards.length <= 2;
    removeButton.setAttribute("aria-label", `Remove person ${index + 1}`);
  });
  addPersonButton.disabled = cards.length >= 4;
}

function collectTable() {
  return [...peopleGrid.children].map((card, index) => ({
    name: card.querySelector(".person-name").value.trim() || `Person ${index + 1}`,
    favorites: card.querySelector(".person-favorites").value.split(",").map((favorite) => favorite.trim()).filter(Boolean).slice(0, 3),
    diningPreferences: card.querySelector(".person-dining").value.split(",").map((preference) => preference.trim()).filter(Boolean).slice(0, 4)
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
  results.hidden = false;
  const places = plan.places || [];
  if (!places.length) {
    resultsNote.hidden = true;
    const unavailable = plan.mode === "preview";
    recommendations.innerHTML = unavailable
      ? `<div class="empty-state"><span>↻</span><strong>Recommendations are taking a break.</strong><p>Please try again in a little while.</p></div>`
      : `<div class="empty-state"><span>✦</span><strong>No shared picks this time.</strong><p>Try a different favorite or a nearby neighborhood to widen the search.</p></div>`;
    resultBadge.textContent = unavailable ? "TEMPORARILY UNAVAILABLE" : "TRY ANOTHER MIX";
    context.textContent = unavailable
      ? "We couldn’t load nearby recommendations just now. Your table is ready to try again."
      : `We couldn’t find enough overlap near ${plan.city || cityInput.value} with these favorites.`;
    refreshButton.hidden = true;
    return;
  }
  recommendations.innerHTML = places.map((place, index) => {
    const scores = place.affinityByParticipant || [];
    const scoreRows = scores.map(({ name, score, signals }) => {
      const value = Number(score);
      const scoreText = Number.isFinite(value) ? value.toFixed(2) : "—";
      const scorePercent = Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) : 0;
      return `<div class="score-row"><div class="score-person"><i aria-hidden="true"></i><span>${escapeHtml(name)}</span></div><strong aria-label="Qloo affinity ${escapeHtml(scoreText)}">${escapeHtml(scoreText)}</strong><div class="score-meter" role="img" aria-label="${escapeHtml(name)} Qloo affinity ${escapeHtml(scoreText)}"><span style="width:${scorePercent}%"></span></div>${signals?.length ? `<small>Matched taste: ${escapeHtml(signals.join(", "))}</small>` : ""}</div>`;
    }).join("");
    const weakestFit = scores.reduce((lowest, score) => Number(score.score) < Number(lowest.score) ? score : lowest, scores[0]);
    const weakestFitNote = weakestFit
      ? `<div class="weakest-fit"><span>LOWEST DINER FIT</span><strong>${Number(weakestFit.score).toFixed(2)}</strong><small>${escapeHtml(weakestFit.name)}</small></div>`
      : "";
    const tags = (place.tags || []).map((tag) => `<span class="place-tag">${escapeHtml(tag)}</span>`).join("");
    const percent = Math.round(Number(place.balancedFit || 0) * 100);
    return `<article class="rec-card"><div class="rec-topline"><span class="rec-type">IN EVERY DINER’S QLOO LIST <b>0${index + 1}</b></span><span class="fair-score" title="Harmonic mean of individual Qloo affinities" aria-label="Balanced group fit ${place.balancedFit.toFixed(2)} out of 1"><strong>${escapeHtml(place.balancedFit.toFixed(2))}</strong><small>BALANCED FIT</small></span></div><h3 class="rec-title">${escapeHtml(place.name)}</h3><p class="rec-meta"><span>RESTAURANT</span><i>·</i>${escapeHtml(place.location || plan.city)}</p><div class="fit-meter" role="img" aria-label="Balanced group fit ${percent} percent"><span style="width:${Math.min(100, percent)}%"></span></div><p class="score-caption">Qloo affinity by diner · higher is a stronger model match</p><div class="score-list">${scoreRows}</div>${weakestFitNote}${tags ? `<div class="place-tags">${tags}</div>` : ""}<a class="rec-link" href="${escapeHtml(place.url)}" target="_blank" rel="noreferrer">View on Maps <span aria-hidden="true">↗</span></a></article>`;
  }).join("");
  resultsNote.hidden = false;
  resultBadge.textContent = `${places.length} ${places.length === 1 ? "PLACE" : "PLACES"} FOR YOUR TABLE`;
  context.textContent = `${places.length === 1 ? "This restaurant appeared" : "These restaurants appeared"} in every diner’s independent Qloo results near ${plan.city}. Compare the individual fits and choose together.`;
  const usedDiningPreferences = (plan.diningPreferences || []).flatMap((person) => person.usedByQloo?.map((preference) => `${person.name}: ${preference}`) || []);
  const unverifiedDiningPreferences = (plan.diningPreferences || []).flatMap((person) => person.unverified?.map((preference) => `${person.name}: ${preference}`) || []);
  if (usedDiningPreferences.length) context.textContent += ` Qloo also used these dining tags to influence affinity: ${usedDiningPreferences.join("; ")}.`;
  if (unverifiedDiningPreferences.length) context.textContent += ` Qloo did not use these inputs in ranking: ${unverifiedDiningPreferences.join("; ")}. Confirm practical details with the restaurant, or enter a complete name if one was meant as a favorite.`;
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
  submitButton.querySelector("span:first-child").textContent = "Finding good places…";
  refreshButton.disabled = true;
  try {
    const response = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, allowGroqAssist: groqAssistInput.checked, excludeIds }) });
    const plan = await response.json();
    if (!response.ok) {
      if (plan.needsConfirmation && Array.isArray(plan.suggestions) && plan.suggestions.length) {
        showMatchSuggestions(plan.suggestions);
        matchReview.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const retryHint = Number.isFinite(plan.retryAfterSeconds) && plan.retryAfterSeconds > 0
        ? ` Please try again in about ${plan.retryAfterSeconds} seconds.`
        : "";
      throw new Error(`${plan.error || "The shared lunch planner couldn’t finish that request."}${retryHint}`);
    }
    matchReview.hidden = true;
    pendingMatches = [];
    renderPlan(plan);
    document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { showToast(error.message || "Couldn’t reach Common Table. Please try again."); }
  finally {
    submitButton.disabled = false;
    refreshButton.disabled = false;
    submitButton.querySelector("span:first-child").textContent = "Find our common ground";
  }
}

function showMatchSuggestions(suggestions) {
  pendingMatches = suggestions;
  matchSuggestions.innerHTML = suggestions.map((suggestion, index) => `
    <article class="match-suggestion">
      <div><span class="match-person">${escapeHtml(suggestion.participantName || `Person ${suggestion.participantIndex + 1}`)}</span><p>Entered: <strong>${escapeHtml(suggestion.original)}</strong></p><p>Qloo matched: <strong>${escapeHtml(suggestion.suggested)}</strong></p></div>
      <button class="match-use-button" type="button" data-match-index="${index}">Use this name</button>
    </article>`).join("");
  matchReview.hidden = false;
}

matchSuggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-match-index]");
  if (!button) return;
  const suggestion = pendingMatches[Number(button.dataset.matchIndex)];
  const card = peopleGrid.children[suggestion?.participantIndex];
  const field = card?.querySelector(".person-favorites");
  if (!suggestion || !field) return;
  const favorites = field.value.split(",").map((favorite) => favorite.trim()).filter(Boolean);
  const current = favorites[suggestion.favoriteIndex];
  if (!current || current.toLocaleLowerCase() !== suggestion.original.toLocaleLowerCase()) {
    matchReview.hidden = true;
    showToast("That favorite changed. Run the search again to review a fresh match.");
    return;
  }
  favorites[suggestion.favoriteIndex] = suggestion.suggested;
  field.value = favorites.join(", ");
  matchReview.hidden = true;
  pendingMatches = [];
  lastRequest = { city: cityInput.value.trim(), participants: collectTable() };
  saveTable();
  requestPlan(lastRequest);
});

form.addEventListener("input", () => {
  matchReview.hidden = true;
  pendingMatches = [];
});

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

peopleGrid.append(memberCard({ name: "You", favorites: "" }), memberCard({ name: "Lunch buddy", favorites: "" }));
refreshMemberControls();
rememberInput.checked = localStorage.getItem("common-table-remember") === "true";
if (rememberInput.checked) loadTable();
