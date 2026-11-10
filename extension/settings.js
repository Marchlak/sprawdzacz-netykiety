(function (root) {
  "use strict";
  // Personal caution list, not Twitch policy. Short stems intentionally catch inflections.
  const DEFAULT_TERMS = Object.freeze([
    "bambus", "żółtek", "żółtk", "ciot", "cwel", "pedał", "pedal", "pederast", "czarnuch",
    "asfalt", "żydek", "żydk", "żydzior", "żydostw", "żydłak", "nigger", "nigga", "nigg3r",
    "faggot", "fag", "dyke", "tranny", "shemale", "chink", "gook", "spic", "wetback", "kike",
    "raghead", "towelhead", "coon", "darkie", "zipperhead", "sandnigger", "retard", "ret4rd",
    "downie", "mongoloid", "kys", "kill yourself", "kill urself", "zabij się", "zdechnij",
    "heil hitler", "sieg heil", "hitler", "jajko"
  ]);
  const KEY = "twitchGuardConfig";

  function parseConfig(value) {
    if (value === undefined) return root.TwitchGuardMatcher.cleanTerms([...DEFAULT_TERMS]);
    if (!value || value.version !== 1 || !Array.isArray(value.terms)) {
      throw new TypeError("Nieprawidłowa konfiguracja. Otwórz listę i zapisz ją ponownie.");
    }
    return root.TwitchGuardMatcher.cleanTerms(value.terms);
  }

  root.TwitchGuardSettings = Object.freeze({KEY, DEFAULT_TERMS, parseConfig});
  if (typeof module !== "undefined" && module.exports) module.exports = root.TwitchGuardSettings;
})(globalThis);
