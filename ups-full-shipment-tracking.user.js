// ==UserScript==
// @name         UPS.com - Extract all shipment tracking numbers
// @namespace    https://github.com/ruffy314
// @version      0.0.4
// @description  Clicks "Other packages in this shipment" and extracts all tracking numbers
// @match        https://www.ups.com/track*
// @downloadURL  file:///C:/_Code/ups-full-shipment-tracking/ups-full-shipment-tracking.user.js
// @grant        GM_setClipboard
// ==/UserScript==

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isVisible(el) {
  return el && el.offsetParent !== null;
}

function findClickable(text) {
  const lower = text.toLowerCase();
  const elements = document.querySelectorAll('a, button, [role="button"]');

  for (const el of elements) {
    const t = el.textContent?.trim().toLowerCase();
    if (!t || !t.includes(lower)) continue;
    if (!isVisible(el)) continue;

    return el.closest('button, a') || el;
  }
  return null;
}

/**
 * Heuristic: check if list is already open
 * (we assume it's open if we already see multiple tracking numbers)
 */
function isOtherPackagesOpen() {
  const regex = /\b1Z[0-9A-Z]{16}\b/g;
  const matches = document.body.innerText.match(regex);
  return matches && matches.length > 1;
}

async function openOtherPackagesIfNeeded() {
  if (isOtherPackagesOpen()) {
    console.log('✅ Other packages already open');
    return true;
  }

  for (let i = 0; i < 10; i++) {
    const btn = findClickable('other packages');

    if (btn) {
      console.log('✅ Opening "Other packages"');
      btn.click();
      return true;
    }

    console.log(`⏳ Waiting for "Other packages" (${i + 1}/10)`);
    await sleep(1000);
  }

  console.warn('❌ Could not find "Other packages"');
  return false;
}

function extractTrackingNumbers() {
  const set = new Set();
  const regex = /\b1Z[0-9A-Z]{16}\b/g;

  const text = document.body.innerText;
  const matches = text.match(regex);

  if (matches) {
    matches.forEach(m => set.add(m));
  }

  return Array.from(set);
}

function tryClickNext() {
  const btn = findClickable('next');

  if (!btn) {
    console.log('✅ No Next button → done');
    return false;
  }

  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
    console.log('✅ Next disabled → done');
    return false;
  }

  console.log('➡️ Clicking Next');
  btn.click();
  return true;
}

/**
 * MAIN PROCESS
 */
async function runExtractor() {
  console.log('🚀 Extraction started');

  await sleep(3000);

  const opened = await openOtherPackagesIfNeeded();

  if (opened) {
    await sleep(3000);
  }

  const all = new Set();
  let lastSnapshot = '';

  while (true) {
    console.log('📦 Extracting page');

    const currentNumbers = extractTrackingNumbers();
    currentNumbers.forEach(n => all.add(n));

    const snapshot = currentNumbers.join(',');

    await sleep(1500);

    const clicked = tryClickNext();
    if (!clicked) break;

    await sleep(3000);

    const newNumbers = extractTrackingNumbers().join(',');

    if (newNumbers === snapshot) {
      console.log('✅ No new data → stopping');
      break;
    }
  }

  const result = Array.from(all);

  console.log('✅ Final:', result);

  if (result.length) {
    const output = result.join('\n');

    if (typeof GM_setClipboard !== 'undefined') {
      GM_setClipboard(output);
    } else {
      navigator.clipboard.writeText(output);
    }

    alert(`✅ ${result.length} tracking numbers copied`);
  } else {
    alert('❌ No tracking numbers found');
  }
}

/**
 * CREATE FLOATING BUTTON
 */
function createButton() {
  const btn = document.createElement('button');

  btn.textContent = '🐒';
  btn.title = 'try to get all parcel numbers';

  Object.assign(btn.style, {
    position: 'fixed',
    top: '50vh',
    right: '20px',
    zIndex: 999999,
    fontSize: '2.5em',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  });

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = '⏳';

    runExtractor().finally(() => {
      btn.disabled = false;
      btn.textContent = '🐒';
    });
  });

  document.body.appendChild(btn);
}

/**
 * INIT
 */
(function () {
  'use strict';
  createButton();
})();
