(() => {
  "use strict";
  const {compileTerms, findMatches} = globalThis.TwitchGuardMatcher;
  const {KEY, parseConfig} = globalThis.TwitchGuardSettings;
  const INPUT = '[data-a-target="chat-input"], [data-test-selector="chat-input"]';
  const SEND = '[data-a-target="chat-send-button"]';
  const ROOT = '[data-a-target="chat-input-container"], .chat-input';
  const MARK = 'data-twitch-guard-blocked';
  const states = new Map();
  let config = {status: "loading", compiled: []};
  let queued = false;
  let configRevision = 0;
  let warningId = 0;

  // Include emote names even when the editor represents them as <img> nodes.
  function readText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.tagName === "IMG") return node.getAttribute("alt") || node.getAttribute("data-emote-name") || "";
    return [...node.childNodes].map(readText).join("");
  }

  function getRoot(editor) {
    return editor.closest(ROOT) || editor.closest("form") || editor.parentElement;
  }

  function editorForButton(button) {
    const existing = [...states.keys()].find(editor => editor.isConnected && getRoot(editor)?.contains(button));
    if (existing) return existing;
    let container = button.parentElement;
    while (container && container !== document.body) {
      const editors = container.querySelectorAll(INPUT);
      if (editors.length === 1) return editors[0];
      if (editors.length > 1) break;
      container = container.parentElement;
    }
    return null;
  }

  function result(editor) {
    if (config.status === "loading") return {blocked: true, message: "Blokada czatu: wczytywanie listy…"};
    if (config.status === "error") return {blocked: true, message: "Blokada czatu: nie można odczytać listy. Otwórz wtyczkę i zapisz listę ponownie, a w razie potrzeby odśwież kartę."};
    const matches = findMatches(readText(editor), config.compiled);
    return {
      blocked: matches.length > 0,
      message: matches.length ? `Wysyłanie zablokowane. Wpis z listy: ${matches.slice(0, 3).join(", ")}${matches.length > 3 ? "…" : ""}. Popraw wiadomość.` : ""
    };
  }

  function setAttribute(element, name, value) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function releaseButton(state, button) {
    const saved = state.buttons.get(button);
    if (!saved) return;
    button.removeAttribute(MARK);
    // Restore only an attribute still owned by us; never touch Twitch's native disabled state.
    if (button.getAttribute("aria-disabled") === "true") {
      if (saved.aria === null) button.removeAttribute("aria-disabled");
      else button.setAttribute("aria-disabled", saved.aria);
    }
    state.buttons.delete(button);
  }

  function cleanup(editor, state) {
    for (const button of [...state.buttons.keys()]) releaseButton(state, button);
    const ids = (editor.getAttribute("aria-describedby") || "").split(/\s+/).filter(id => id && id !== state.warning.id);
    if (ids.length) editor.setAttribute("aria-describedby", ids.join(" "));
    else editor.removeAttribute("aria-describedby");
    state.warning.remove();
    states.delete(editor);
  }

  function render(editor) {
    const container = getRoot(editor);
    if (!container) return result(editor);
    let state = states.get(editor);
    if (!state) {
      const warning = document.createElement("div");
      warning.className = "twitch-guard-warning";
      warning.id = `twitch-guard-warning-${++warningId}`;
      warning.setAttribute("role", "status");
      warning.setAttribute("aria-live", "polite");
      state = {warning, buttons: new Map()};
      states.set(editor, state);
    }
    const check = result(editor);
    if (!state.warning.isConnected || !container.contains(state.warning)) container.append(state.warning);
    if (state.warning.textContent !== check.message) state.warning.textContent = check.message;
    state.warning.hidden = !check.blocked;
    const description = new Set((editor.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    description.add(state.warning.id);
    setAttribute(editor, "aria-describedby", [...description].join(" "));

    const buttons = [...container.querySelectorAll(SEND)];
    // A fallback container may surround only the textbox; associate Twitch's button independently.
    for (const button of document.querySelectorAll(SEND)) {
      if (!buttons.includes(button) && editorForButton(button) === editor) buttons.push(button);
    }
    for (const button of [...state.buttons.keys()]) {
      if (!buttons.includes(button) || !check.blocked) releaseButton(state, button);
    }
    if (check.blocked) {
      for (const button of buttons) {
        if (!state.buttons.has(button)) state.buttons.set(button, {aria: button.getAttribute("aria-disabled")});
        setAttribute(button, MARK, "true");
        setAttribute(button, "aria-disabled", "true");
      }
    }
    return check;
  }

  function refresh() {
    queued = false;
    for (const [editor, state] of states) if (!editor.isConnected || !editor.matches(INPUT)) cleanup(editor, state);
    for (const editor of document.querySelectorAll(INPUT)) render(editor);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(refresh);
  }

  // Capture at window level, before Twitch/React sees Enter, clicks or form submits.
  function guard(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    let editor;
    if (["keydown", "keypress", "keyup"].includes(event.type)) {
      if (event.key !== "Enter" && event.code !== "NumpadEnter") return;
      editor = target.closest(INPUT);
    } else if (event.type === "submit") {
      editor = target.querySelector(INPUT);
    } else {
      const button = target.closest(SEND);
      if (!button) return;
      editor = editorForButton(button);
    }
    if (!editor || !render(editor).blocked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  for (const type of ["keydown", "keypress", "keyup", "click", "pointerdown", "mousedown", "submit"]) {
    window.addEventListener(type, guard, true);
  }
  for (const type of ["input", "change", "paste", "compositionend"]) {
    window.addEventListener(type, event => {
      const editor = event.target instanceof Element ? event.target.closest(INPUT) : null;
      if (editor) render(editor);
      // Paste can precede the DOM insertion; the input event and observer recheck the new value.
      schedule();
    }, true);
  }

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => {
      const element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
      if (element?.closest(".twitch-guard-warning")) return false;
      return true;
    })) schedule();
  });
  observer.observe(document, {childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ["data-a-target", "data-test-selector", "aria-disabled", "disabled", MARK, "alt", "data-emote-name"]});

  function applyConfig(value) {
    try {
      config = {status: "ready", compiled: compileTerms(parseConfig(value))};
    } catch {
      config = {status: "error", compiled: []};
    }
    refresh();
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !Object.hasOwn(changes, KEY)) return;
      configRevision++;
      applyConfig(changes[KEY].newValue);
    });
    const revision = configRevision;
    chrome.storage.local.get(KEY).then(values => {
      if (revision === configRevision) applyConfig(values[KEY]);
    }).catch(() => {
      if (revision === configRevision) {
        config = {status: "error", compiled: []};
        refresh();
      }
    });
  } catch {
    config = {status: "error", compiled: []};
  }
  refresh();
})();
