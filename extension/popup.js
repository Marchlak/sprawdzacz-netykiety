(() => {
  "use strict";
  const {cleanTerms} = globalThis.TwitchGuardMatcher;
  const {KEY, DEFAULT_TERMS, parseConfig} = globalThis.TwitchGuardSettings;
  const terms = document.querySelector("#terms");
  const save = document.querySelector("#save");
  const reset = document.querySelector("#reset");
  const status = document.querySelector("#status");
  let dirty = false;
  let busy = false;
  let revision = 0;

  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }
  function updateCount() {
    const count = cleanTerms(terms.value.split(/\r?\n/)).length;
    document.querySelector("#count").textContent = `Wpisy: ${count}`;
  }
  function load(value) {
    try {
      terms.value = parseConfig(value).join("\n");
      message("Lista działa lokalnie we wszystkich kartach Twitcha.");
    } catch {
      terms.value = "";
      message("Nie można odczytać listy. Wpisz ją ponownie lub wybierz listę startową i zapisz.", true);
    }
    terms.disabled = false;
    save.disabled = false;
    updateCount();
  }

  terms.addEventListener("input", () => {
    dirty = true;
    updateCount();
    message("Masz niezapisane zmiany.");
  });
  reset.addEventListener("click", () => {
    revision++;
    terms.disabled = false;
    save.disabled = false;
    terms.value = cleanTerms([...DEFAULT_TERMS]).join("\n");
    dirty = true;
    updateCount();
    message("Lista startowa przygotowana. Kliknij „Zapisz listę”, aby ją zastosować.");
  });
  document.querySelector("#settings").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    terms.disabled = save.disabled = reset.disabled = true;
    const cleaned = cleanTerms(terms.value.split(/\r?\n/));
    try {
      await chrome.storage.local.set({[KEY]: {version: 1, terms: cleaned}});
      terms.value = cleaned.join("\n");
      dirty = false;
      updateCount();
      message(cleaned.length ? "Zapisano. Lista działa już w otwartych kartach Twitcha." : "Zapisano pustą listę. Żadne słowa nie są teraz blokowane.");
    } catch {
      message("Nie udało się zapisać. Poprzednia lista pozostaje aktywna. Spróbuj ponownie.", true);
    } finally {
      busy = false;
      terms.disabled = save.disabled = reset.disabled = false;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !Object.hasOwn(changes, KEY)) return;
    revision++;
    if (busy) return;
    if (dirty) message("Lista zmieniła się w innym oknie. Zapisanie zastąpi ją Twoją wersją.");
    else load(changes[KEY].newValue);
  });
  const initialRevision = revision;
  chrome.storage.local.get(KEY).then(values => {
    if (revision === initialRevision) load(values[KEY]);
  }).catch(() => {
    if (revision !== initialRevision) return;
    terms.disabled = false;
    save.disabled = false;
    message("Błąd odczytu. Wpisz listę lub wybierz listę startową i zapisz.", true);
  });
})();
