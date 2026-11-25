import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const index = read('index.html');
const guide = read('guide.html');
const tabs = [...index.matchAll(/data-nav href="#([a-z]+)"/g)].map((m) => m[1]);
const section = (id) => {
  const start = guide.indexOf(`<section class="b-sec" id="${id}"`);
  assert.ok(start > -1, `guide is missing the #${id} section`);
  return guide.slice(start, guide.indexOf('</section>', start));
};

test('the app links to the plain-English guide', () => {
  assert.match(index, /href="guide\.html"/);
  assert.match(index, /id="welcome"/);
});

test('the guide tours every section of the app, in order', () => {
  assert.ok(tabs.length >= 5, 'expected at least five sections in the app');
  const tour = section('tour');
  const positions = tabs.map((t) => tour.indexOf(`href="index.html#${t}"`));
  positions.forEach((p, i) => assert.ok(p > -1, `guide is missing a stop for #${tabs[i]}`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'tour stops should follow the app order');
});

test('the guide is honest about the data and the scope', () => {
  assert.match(guide, /fictional/i);
  assert.match(guide, /What it is not/);
  assert.match(section('build'), /Not included/, 'the capability table should state what is out of scope');
});

test('the guide has a glossary of at least ten terms', () => {
  const terms = section('words').match(/<dt>/g) || [];
  assert.ok(terms.length >= 10, `found ${terms.length} glossary terms`);
});

test('the exploration checklist covers every tab and every box has a label', () => {
  const list = section('checklist');
  for (const t of tabs) assert.ok(list.includes(`href="index.html#${t}"`), `checklist has no step on #${t}`);
  const ids = [...list.matchAll(/<input type="checkbox" id="([^"]+)" data-check="([^"]+)"/g)];
  assert.ok(ids.length >= tabs.length, 'expected at least one checklist step per tab');
  assert.equal(new Set(ids.map((m) => m[2])).size, ids.length, 'checklist keys must be unique');
  for (const [, id] of ids) assert.ok(list.includes(`<label for="${id}">`), `checkbox #${id} has no label`);
});

test('every in-page link points at something that exists', () => {
  const targets = new Set([...guide.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]));
  for (const t of targets) assert.match(guide, new RegExp(`id="${t}"`), `#${t} has no target`);
});

test('the live figures come from the real engine', async () => {
  const { snapshot } = await import('../src/briefing.js');
  const figs = snapshot();
  assert.equal(figs.length, 4);
  for (const f of figs) {
    assert.ok(f.value && f.label, 'each figure needs a value and a label');
    assert.doesNotMatch(`${f.value} ${f.label}`, /NaN|undefined|Infinity/);
  }
  const { COMPANIES, analyzeCompany } = await import('../src/engine.js');
  const d = analyzeCompany(COMPANIES[0]).dcf;
  assert.ok(figs[0].value.includes(d.pricePerShare.toFixed(2)), `${figs[0].value} should show ${d.pricePerShare.toFixed(2)}`);
});

test('the stated test count matches the suite', () => {
  const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.mjs'));
  const count = files.reduce((n, f) => n + (read(`tests/${f}`).match(/^test\(/gm) || []).length, 0);
  assert.match(guide, new RegExp(`<strong data-tests>${count}</strong>`), `guide should state ${count} tests`);
});
