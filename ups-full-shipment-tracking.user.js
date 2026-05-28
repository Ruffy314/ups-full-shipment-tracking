// ==UserScript==
// @name         UPS.com - Extract all shipment tracking numbers
// @namespace    https://github.com/ruffy314
// @version      0.0.1
// @description  Clicks "Other packages in this shipment" and extracts all tracking numbers
// @match        https://www.ups.com/track*
// @grant        GM_setClipboard
// ==/UserScript==

/**
 * Wait helper
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Try to find and click the "Other packages in this shipment" button
 */
async function openOtherPackages() {
  const possibleSelectors = [
    'a[data-testid="other-packages-link"]',
    'button[data-testid="other-packages-link"]',
    'a[href*="shipment"]',
    'button',
    'a'
  ];

  for (const selector of possibleSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (el.textContent?.toLowerCase().includes('other packages')) {
        console.log('Found button:', el);
        el.click();
        return true;
      }
    }
  }

  console.warn('Could not find "Other packages" button');
  return false;
}

/**
 * Extract tracking numbers from page
 */
function extractTrackingNumbers() {
  const results = new Set();

  // UPS tracking numbers are usually 1Z + 16 chars
  const regex = /\b1Z[0-9A-Z]{16}\b/g;

  document.querySelectorAll('body *').forEach(el => {
    const text = el.textContent;
    if (!text) return;

    const matches = text.match(regex);
    if (matches) {
      matches.forEach(m => results.add(m));
    }
  });

  return Array.from(results);
}

(async function () {
  'use strict';

  await sleep(3000);

  console.log('UPS extractor running...');

  // Step 1: click button
  const clicked = await openOtherPackages();

  if (clicked) {
    // Step 2: wait for dynamic content to load
    await sleep(3000);
  }

  // Step 3: extract
  const numbers = extractTrackingNumbers();

  console.log('Tracking numbers:', numbers);

  if (numbers.length) {
    const output = numbers.join('\n');

    // Copy to clipboard
    if (typeof GM_setClipboard !== 'undefined') {
      GM_setClipboard(output);
    } else {
      navigator.clipboard.writeText(output);
    }

    alert(`Found ${numbers.length} tracking numbers (copied to clipboard)`);
  } else {
    alert('No tracking numbers found');
  }
})();