// ==UserScript==
// @name         UPS.com - Extract all shipment tracking numbers
// @namespace    https://github.com/ruffy314
// @version      0.0.2
// @description  Clicks "Other packages in this shipment" and extracts all tracking numbers
// @match        https://www.ups.com/track*
// @downloadURL  file:///C:/_Code/ups-full-shipment-tracking/ups-full-shipment-tracking.user.js
// @grant        GM_setClipboard
// ==/UserScript==

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Find clickable element by exact visible text
 * (more reliable for React apps like UPS)
 */
function findClickableByText(text) {
  const lower = text.toLowerCase();

  const candidates = document.querySelectorAll('a, button, [role="button"]');

  for (const el of candidates) {
    const t = el.textContent?.trim().toLowerCase();
    if (t && t.includes(lower)) {
      return el;
    }
  }

  return null;
}

/**
 * Retry until "Other packages" is found
 */
async function openOtherPackages() {
  for (let i = 0; i < 10; i++) {
    const btn = findClickableByText('other packages');

    if (btn) {
      console.log('✅ Found "Other packages":', btn);

      // Sometimes UPS attaches click to parent
      let target = btn;
      if (btn.closest('button, a')) {
        target = btn.closest('button, a');
      }

      target.click();
      return true;
    }

    console.log('⏳ Waiting for "Other packages"... attempt', i + 1);
    await sleep(1000);
  }

  console.warn('❌ Could not find "Other packages"');
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
 * Click Next (pagination)
 */
function clickNext() {
  const btn = findClickableByText('next');

  if (btn && !btn.disabled) {
    console.log('➡️ Clicking Next');
    btn.click();
    return true;
  }

  return false;
}

(async function () {
  'use strict';

  console.log('🚀 Script start');

  // ✅ required initial delay
  await sleep(3000);

  // ✅ open list
  const opened = await openOtherPackages();

  if (opened) {
    await sleep(3000);
  }

  const all = new Set();

  while (true) {
    console.log('📦 Extracting page');

    extractTrackingNumbers().forEach(n => all.add(n));

    await sleep(1500);

    const next = clickNext();
    if (!next) break;

    await sleep(3000);
  }

  const result = Array.from(all);

  console.log('✅ Final result:', result);

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