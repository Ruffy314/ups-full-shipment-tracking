// ==UserScript==
// @name         UPS.com - Extract all shipment tracking numbers
// @namespace    https://github.com/ruffy314
// @version      0.0.6
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

  for (let i = 0; i < 5; i++) {
    const btn = findClickable('other packages');

    if (btn) {
      console.log('✅ Opening "Other packages"');
      btn.click();
      return true;
    }

    console.log(`⏳ Waiting for "Other packages" (${i + 1}/5)`);
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
 * RESULTS POPUP
 */
function showResultsPopup(numbers) {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.4)',
    zIndex: 1000000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px'
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    background: '#fff',
    borderRadius: '10px',
    width: 'min(90vw, 650px)',
    maxHeight: '80vh',
    padding: '16px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  });

  const title = document.createElement('div');
  title.textContent = `Found ${numbers.length} tracking number${numbers.length === 1 ? '' : 's'}`;
  title.style.fontSize = '16px';
  title.style.fontWeight = '600';

  const helper = document.createElement('div');
  helper.textContent = 'You can select and copy the list below.';
  helper.style.color = '#555';
  helper.style.fontSize = '12px';

  const textarea = document.createElement('textarea');
  textarea.readOnly = true;
  textarea.value = numbers.join('\n');
  Object.assign(textarea.style, {
    width: '100%',
    flex: '1 1 auto',
    minHeight: '200px',
    maxHeight: '50vh',
    resize: 'vertical',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: '1.4',
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    boxSizing: 'border-box'
  });

  const buttonsRow = document.createElement('div');
  Object.assign(buttonsRow.style, {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px'
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  Object.assign(closeBtn.style, {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #ccc',
    background: '#f6f6f6',
    cursor: 'pointer'
  });
  closeBtn.addEventListener('click', () => overlay.remove());

  buttonsRow.appendChild(closeBtn);
  modal.appendChild(title);
  modal.appendChild(helper);
  modal.appendChild(textarea);
  modal.appendChild(buttonsRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Auto-focus and select all so the user can press Ctrl/Cmd+C immediately
  setTimeout(() => {
    textarea.focus();
    textarea.select();
  }, 0);
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

  // Show popup with results
  showResultsPopup(result);
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
    background: 'linear-gradient(to bottom, #81c8f1 15%, #b7eefb 55%, #b7d87b 65%, #6ac441 90%)',
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
