/* Shared pure matching logic; also loadable with Node for tests. */
(function (root) {
  "use strict";
  const digits = Object.freeze({0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g"});

  function normalize(value, leet = false) {
    let text = String(value).normalize("NFKD").toLowerCase()
      .replace(/ł/g, "l").replace(/[\p{M}\p{Cf}\p{Cc}\p{Z}\p{P}\p{S}\s]/gu, "");
    if (leet) text = text.replace(/[01345789]/g, digit => digits[digit]);
    return text;
  }

  function cleanTerms(values) {
    if (!Array.isArray(values) || values.some(value => typeof value !== "string")) {
      throw new TypeError("Lista musi zawierać wyłącznie tekst.");
    }
    const seen = new Set();
    return values.map(value => value.trim()).filter(value => {
      const key = normalize(value, true);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function compileTerms(values) {
    return cleanTerms(values).map(term => ({term, plain: normalize(term), leet: normalize(term, true)}));
  }

  function findMatches(text, compiled) {
    const plain = normalize(text);
    const leet = normalize(text, true);
    return compiled.filter(entry => plain.includes(entry.plain) || leet.includes(entry.leet))
      .map(entry => entry.term);
  }

  const api = Object.freeze({normalize, cleanTerms, compileTerms, findMatches});
  root.TwitchGuardMatcher = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
