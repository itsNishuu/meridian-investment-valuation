import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const index = read('index.html');
const guide = read('guide.html');
const tabs = [...index.matchAll(/data-nav href="#([a-z]+)"/g)].map((m) => m[1]);

test('the app links to the plain-English guide', () => {
  assert.match(index, /href="guide\.html"/);
  assert.match(index, /id="welcome"/);
});

test('the guide tours every section of the app, in order', () => {
  assert.ok(tabs.length >= 5, 'expected at least five sections in the app');
  const positions = tabs.map((t) => guide.indexOf(`href="index.html#${t}"`));
  positions.forEach((p, i) => assert.ok(p > -1, `guide is missing a stop for #${tabs[i]}`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'tour stops should follow the app order');
});

test('the guide is honest about the data and the scope', () => {
  assert.match(guide, /fictional/i);
  assert.match(guide, /What it is not/);
});

test('the guide has a glossary of at least ten terms', () => {
  const terms = guide.match(/<dt>/g) || [];
  assert.ok(terms.length >= 10 + 3, `found ${terms.length} <dt> elements`);
});
