const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalize, cleanTerms, compileTerms, findMatches} = require('../extension/matcher.js');
const {parseConfig, DEFAULT_TERMS} = require('../extension/settings.js');

test('normalization handles case, compatibility Unicode, accents, separators and symbols', () => {
  assert.equal(normalize('  ŁÓDŹ — M.Ａ K!\u200b\u2060\ufeff🙂'), 'lodzmak');
  assert.equal(normalize('01345789', true), 'oieastbg');
  assert.equal(normalize('01345789'), '01345789');
});

test('a listed fragment is found inside words, names, inflections and across separators', () => {
  const entries = compileTerms(['mak']);
  for (const value of ['MAK', 'smakowity', 'makowy', 'gucioMak', 'ma.k', 'm a k', 'm4k', 'm\u200ba\u2060k', 'ma🙂k', 'ma\u0000k', 'mam akurat kawę']) {
    assert.deepEqual(findMatches(value, entries), ['mak'], value);
  }
  for (const value of ['', 'rower', 'mleko', 'akm']) assert.deepEqual(findMatches(value, entries), [], value);
});

test('both list entries and message use the same normalization', () => {
  assert.deepEqual(findMatches('LODZ', compileTerms(['łódź'])), ['łódź']);
  assert.deepEqual(findMatches('mak', compileTerms(['M.4 K'])), ['M.4 K']);
  assert.deepEqual(findMatches('m4k', compileTerms(['mak'])), ['mak']);
});

test('cleanup removes empty and equivalent entries without admitting empty needles', () => {
  assert.deepEqual(cleanTerms([' mak ', 'MAK', 'm4k', ' ', '!!!', 'łódź', 'LODZ']), ['mak', 'łódź']);
  assert.deepEqual(findMatches('rower', compileTerms(['', '!!!'])), []);
  assert.throws(() => cleanTerms(['mak', null]), TypeError);
  assert.throws(() => cleanTerms('mak'), TypeError);
});

test('missing config loads defaults, empty list stays empty, malformed config fails closed', () => {
  assert.ok(parseConfig(undefined).length > 30);
  assert.deepEqual(parseConfig({version: 1, terms: []}), []);
  for (const value of [null, {}, {version: 2, terms: []}, {version: 1, terms: [5]}]) {
    assert.throws(() => parseConfig(value), TypeError);
  }
  assert.ok(compileTerms([...DEFAULT_TERMS]).every(entry => entry.plain && entry.leet));
});
