// ==UserScript==
// @name         UPS.com - Extract all shipment tracking numbers
// @namespace    https://github.com/ruffy314
// @version      0.0.3
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

/**
 * Find clickable button by visible text
 */
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
 * Open "Other packages"
 */
async function openOtherPackages() {
  for (let i = 0; i < 10; i++) {
    const btn = findClickable('other packages');

    if (btn) {
      console.log('✅ Clicking "Other packages"');
      btn.click();
      return true;
    }

    console.log(`⏳ Waiting for "Other packages" (${i + 1}/10)`);
    await sleep(1000);
  }

  return false;
}

/**
 * Extract tracking numbers
 */
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

/**
 * Try clicking "Next" safely
 */
function tryClickNext() {
  const btn = findClickable('next');

  if (!btn) {
    console.log('✅ No Next button found → done');
    return false;
  }

  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
    console.log('✅ Next button disabled → done');
    return false;
  }

  console.log('➡️ Clicking Next');
  btn.click();
  return true;
}

(async function () {
  'use strict';

  console.log('🚀 Start');

  await sleep(3000);

  const opened = await openOtherPackages();

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

    // ✅ detect if page didn't change → stop loop
    const newNumbers = extractTrackingNumbers().join(',');

    if (newNumbers === snapshot) {
      console.log('✅ No new data after Next → stopping');
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
})();