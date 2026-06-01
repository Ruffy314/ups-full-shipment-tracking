// ==UserScript==
// @name         UPS.com - Extract all shipment tracking numbers
// @namespace    https://github.com/ruffy314
// @version      0.1.0
// @description  Clicks "Other packages in this shipment" and extracts all tracking numbers
// @match        https://www.ups.com/track*
// @downloadURL  https://cdn.jsdelivr.net/gh/Ruffy314/ups-full-shipment-tracking@main/ups-full-shipment-tracking.user.js
// ==/UserScript==

const documentLanguage = (document.documentElement.lang || 'en').split(/[-_]/)[0];

/**
 * Localized UI phrases and synonyms for robust matching.
 * Add future languages by extending the object below.
 */
/** @type {Record<string, {othersPhrases: string[], nextPhrases: string[], resultText: string, ariaNext?: string}>} */
const localizationStrings = {
  en: {
    othersPhrases: [
      'other packages',
      'other packages in this shipment'
    ],
    nextPhrases: ['next'],
    resultText: 'You can copy the list below.',
    // In both EN and DE snapshots, aria-label for Next remains "next"
    ariaNext: 'next',
  },
  de: {
    othersPhrases: [
      'weitere pakete',
      'weitere pakete in dieser sendung'
    ],
    // Include common synonyms; we will use word-boundary matching
    nextPhrases: ['weiter', 'nächste'],
    resultText: 'Sie können die folgende Liste kopieren.',
    ariaNext: 'next',
  },
};

const uiTexts = localizationStrings[documentLanguage] ?? localizationStrings.en;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return (
    el.offsetParent !== null &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function normalizeText(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryIncludes(haystack, needle) {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  try {
    const re = new RegExp(`\\b${escapeRegex(n)}\\b`, 'i');
    return re.test(h);
  } catch { return h.includes(n); }
}

function textMatchesAny(el, phrases) {
  const t = normalizeText(el.textContent || '');
  return phrases.some(p => wordBoundaryIncludes(t, p));
}

function queryVisibleAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector)).filter(isVisible);
}

function findAdditionalPackagesToggle() {
  // 1) Most robust (current app): aria-controls points to the drawer id
  const byAria = document.querySelector('button[aria-controls="stApp_multiPieceShipmentContent"]');
  if (isVisible(byAria)) return byAria;

  // 2) Fallback: find a section card header button with a title matching the localized phrases
  const candidates = queryVisibleAll('button.custom-title-button');
  for (const btn of candidates) {
    const heading = btn.querySelector('h2, h3, .card-title-heading');
    if (!heading) continue;
    if (textMatchesAny(heading, uiTexts.othersPhrases)) {
      return btn;
    }
  }

  // 3) Last resort: visible buttons with matching text anywhere, but prefer those controlling a drawer
  const buttons = queryVisibleAll('button, [role="button"]');
  for (const b of buttons) {
    if (textMatchesAny(b, uiTexts.othersPhrases)) {
      const controls = b.getAttribute('aria-controls');
      if (controls && document.getElementById(controls)) return b;
    }
  }
  for (const b of buttons) {
    if (textMatchesAny(b, uiTexts.othersPhrases)) return b;
  }

  return null;
}

function getDrawerFromToggle(toggle) {
  if (!toggle) return null;
  const id = toggle.getAttribute('aria-controls');
  if (id) {
    const target = document.getElementById(id);
    if (target) return target;
  }
  // Fallback: nearest drawer-content in the same card
  const card = toggle.closest('.ups-appCard, ups-card, .ups-card');
  const drawer = card ? card.querySelector('.drawer-content') : null;
  return drawer || null;
}

function findOpenDrawer() {
  // Priority: known id with expanded class
  const byId = document.getElementById('stApp_multiPieceShipmentContent');
  if (byId && isVisible(byId) && byId.classList.contains('drawer-expanded')) return byId;

  // Otherwise: any visible expanded drawer-content that contains tracking rows/links
  const drawers = queryVisibleAll('.drawer-content.drawer-expanded');
  for (const d of drawers) {
    const hasPagination = !!d.querySelector('app-ups-client-pagination, .ups-pagination-wrapper');
    const has1Z = /\b1Z[0-9A-Z]{16}\b/.test(d.textContent || '');
    if (hasPagination || has1Z) return d;
  }
  return null;
}

function isOtherPackagesOpen() {
  const toggle = findAdditionalPackagesToggle();
  const drawer = findOpenDrawer();
  if (toggle && normalizeText(toggle.getAttribute('aria-expanded')) === 'true') return true;
  if (drawer) return true;
  // Last resort: multiple tracking numbers visible on body
  const matches = (document.body.innerText || '').match(/\b1Z[0-9A-Z]{16}\b/g);
  return !!(matches && matches.length > 1);
}

async function openOtherPackagesIfNeeded() {
  if (isOtherPackagesOpen()) {
    console.log('✅ Other packages already open');
    return true;
  }

  const toggle = findAdditionalPackagesToggle();
  if (!toggle) {
    console.warn('❌ Could not find the "Other packages" toggle');
    return false;
  }

  const drawer = getDrawerFromToggle(toggle);
  const alreadyExpanded = normalizeText(toggle.getAttribute('aria-expanded')) === 'true' || (drawer && drawer.classList.contains('drawer-expanded'));
  if (alreadyExpanded) return true;

  console.log('✅ Opening "Other packages"');
  toggle.click();

  // Wait for expansion (aria or class change or more 1Z numbers appear)
  for (let i = 0; i < 10; i++) {
    await sleep(300);
    const d = findOpenDrawer();
    if (d) return true;
  }

  console.warn('❌ Drawer did not expand');
  return false;
}

function getNextButtonInDrawer(drawer) {
  if (!drawer) return null;

  // Scope: identify a pagination root inside drawer
  const scope = drawer.querySelector('.ups-pagination-wrapper, app-ups-client-pagination') || drawer;

  // 1) Prefer known id within scope
  let btn = scope.querySelector('#stApp_pagination_nextBtn');
  if (isVisible(btn)) return btn;

  // 2) Class-based next button inside pagination wrapper
  btn = scope.querySelector('.ups-pagination-btn_next');
  if (isVisible(btn)) return btn;

  // 3) aria-label based (UPS keeps aria-label="next" across locales per snapshots)
  if (uiTexts.ariaNext) {
    btn = scope.querySelector(`[aria-label="${uiTexts.ariaNext}"]`);
    if (isVisible(btn)) return btn;
  }

  // 4) Icon/right-arrow based within pagination wrapper
  const candidates = queryVisibleAll('button, [role="button"]', scope);
  for (const c of candidates) {
    const hasRightIcon = c.querySelector('.ups-icon-right-arrow, [aria-hidden="true"].ups-icon-right-arrow, .icon.ups-icon-right-arrow, .chevron-right, .icon-chevron-right');
    if (hasRightIcon && isVisible(c)) return c;
  }

  // 5) Text fallback (word-boundary) limited to scope to avoid global noise
  for (const c of candidates) {
    const t = normalizeText(c.textContent || '');
    if (!t) continue;
    if (uiTexts.nextPhrases.some(p => wordBoundaryIncludes(t, p))) return c;
  }

  return null;
}

function isDisabled(btn) {
  if (!btn) return true;
  if (btn.disabled) return true;
  const aria = normalizeText(btn.getAttribute('aria-disabled'));
  if (aria === 'true') return true;
  return false;
}

function extractTrackingNumbers() {
  const set = new Set();
  const regex = /\b1Z[0-9A-Z]{16}\b/g;
  const text = document.body.innerText || '';
  const matches = text.match(regex);
  if (matches) matches.forEach(m => set.add(m));
  return Array.from(set);
}

function extractTrackingNumbersInDrawer(drawer) {
  if (!drawer) return [];
  const set = new Set();
  const regex = /\b1Z[0-9A-Z]{16}\b/g;
  const text = drawer.innerText || '';
  const matches = text.match(regex);
  if (matches) matches.forEach(m => set.add(m));
  return Array.from(set);
}

function tryClickNext() {
  const drawer = findOpenDrawer();
  if (!drawer) {
    console.log('ℹ️ No open drawer found for pagination');
    return false;
  }

  const btn = getNextButtonInDrawer(drawer);
  if (!btn) {
    console.log('✅ No Next button → done');
    return false;
  }
  if (isDisabled(btn)) {
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
  helper.textContent = uiTexts.resultText;
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

  const opened = await openOtherPackagesIfNeeded();
  if (opened) await sleep(1000);

  const all = new Set();
  let page = 1;

  while (true) {
    console.log(`📦 Extracting page ${page}`);
    const currentNumbers = extractTrackingNumbers();
    currentNumbers.forEach(n => all.add(n));

    const snapshot = currentNumbers.join(',');
    await sleep(1000);

    const clicked = tryClickNext();
    if (!clicked) break;

    await sleep(2500);

    const newNumbers = extractTrackingNumbers().join(',');
    if (newNumbers === snapshot) {
      console.log('✅ No new data → stopping');
      break;
    }
    page += 1;
  }

  const result = Array.from(all);
  console.log('✅ Final:', result);
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

