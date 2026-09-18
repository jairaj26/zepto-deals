/**
 * Zepto Deals Bookmarklet (Zepto Grid UI Architecture)
 * ---------------------------------------------------
 * - Modern Zepto-style Product Grid (cards with images, MRP, selling price, discounts, direct links).
 * - Out of stock (OOS) detection with modern badges, dimmed styling, and filter controls.
 * - Comprehensive Dropdown Filters: Subcategory, Min-Discount, Availability (In-Stock / OOS), Sort By.
 * - Multi-source Session & Location Catcher (Body, localStorage, cookies, headers).
 * - Resilient Recursive Widget Parser (handles all layout containers and grids).
 * - Two-step fetch button to completely bypass Popup Blockers.
 * - Instant CSV Export.
 */
(function () {
  'use strict';

  if (window.__zdealsLoaded) {
    console.log('[zdeals] already loaded');
    return;
  }
  window.__zdealsLoaded = true;

  // ================== Config ==================
  const STORE_KEY = 'zdeals:store';
  const CATEGORIES_KEY = 'zdeals:categories';
  const SUBCATS_PREFIX = 'zdeals:subcategories:';
  const CATEGORY_TTL_MS = 7 * 24 * 60 * 60 * 1000; 
  const MAX_SELECTED_PER_CATEGORY = 2; // Strict limit: max 2 subcategories per category
  const MAX_PAGES_PER_SUBCAT = 20;
  const ALL_CATEGORIES_LAYOUT_ID = '9277';
  const DEFAULT_LATITUDE = 12.9716; // Generic Central Bengaluru fallback
  const DEFAULT_LONGITUDE = 77.5946;

  let capturedHeaders = null;
  let capturedLocation = null;
  let fetchedProductsData = []; 
  let flatSelectionsData = [];

  // ================== Location Discovery ==================
  function extractLocationFromEnv() {
    if (capturedLocation) return;

    // 1. Try scanning localStorage for user location / address objects
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('location') || key.includes('address') || key.includes('user_loc') || key.includes('geo'))) {
          try {
            const val = JSON.parse(localStorage.getItem(key));
            if (val && typeof val === 'object') {
              const lat = val.latitude || val.lat || (val.coords && val.coords.latitude) || (val.location && val.location.latitude);
              const lon = val.longitude || val.lon || val.lng || (val.coords && val.coords.longitude) || (val.location && val.location.longitude);
              if (lat && lon && !isNaN(Number(lat)) && !isNaN(Number(lon))) {
                capturedLocation = { latitude: Number(lat), longitude: Number(lon) };
                return;
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    // 2. Try scanning cookies for location cookies
    try {
      const matchLat = document.cookie.match(/(?:^|;\s*)(?:user_lat|latitude|lat)=([^;]+)/);
      const matchLng = document.cookie.match(/(?:^|;\s*)(?:user_lon|longitude|lng|lon)=([^;]+)/);
      if (matchLat && matchLng) {
        const lat = parseFloat(matchLat[1]);
        const lon = parseFloat(matchLng[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          capturedLocation = { latitude: lat, longitude: lon };
          return;
        }
      }
    } catch (e) {}
  }

  // ================== Omni-Catcher ==================
  function installOmniCatcher() {
    extractLocationFromEnv();

    if (window.__zdealsOmniPatched) return;
    window.__zdealsOmniPatched = true;

    let captured = false;

    const origFetch = window.fetch;
    window.fetch = function(input, init) {
      if (captured) return origFetch.apply(this, arguments);
      try {
        let url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.includes('bff-gateway.zepto.com')) {
          let headers = {};
          if (input instanceof Request) input.headers.forEach((v, k) => headers[k.toLowerCase()] = v);
          if (init && init.headers) {
            if (init.headers instanceof Headers) init.headers.forEach((v, k) => headers[k.toLowerCase()] = v);
            else if (Array.isArray(init.headers)) init.headers.forEach(([k, v]) => headers[k.toLowerCase()] = v);
            else Object.keys(init.headers).forEach(k => headers[k.toLowerCase()] = init.headers[k]);
          }
          if (headers['request-signature'] || headers['x-csrf-secret']) {
            capturedHeaders = headers;
            captured = true;
            extractLocFromBody(init ? init.body : null);
          }
        }
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._zUrl = url;
      this._zHeaders = {};
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      this._zHeaders[name.toLowerCase()] = value;
      return origSetHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
      if (!captured && this._zUrl && this._zUrl.includes('bff-gateway.zepto.com')) {
        if (this._zHeaders['request-signature'] || this._zHeaders['x-csrf-secret']) {
          capturedHeaders = this._zHeaders;
          captured = true;
          extractLocFromBody(body);
        }
      }
      return origSend.apply(this, arguments);
    };

    function extractLocFromBody(bodyStr) {
      try {
        if (bodyStr && typeof bodyStr === 'string') {
          const parsed = JSON.parse(bodyStr);
          if (parsed.latitude && parsed.longitude) {
            capturedLocation = { latitude: Number(parsed.latitude), longitude: Number(parsed.longitude) };
          }
        }
      } catch (e) {}
      if (!capturedLocation) extractLocationFromEnv();
    }
  }

  // Forward-only navigation sitting on /search triggers signed BFF requests
  function triggerPhantomNavigation() {
    function goToSearch() {
      const searchLink = document.querySelector('a[href^="/search"]');
      if (searchLink) {
        searchLink.click();
      } else {
        window.history.pushState(null, '', '/search');
        window.dispatchEvent(new Event('popstate'));
      }
    }

    const isSearch = window.location.pathname.includes('/search');

    if (!isSearch) {
      goToSearch();
      return;
    }

    const homeLink = document.querySelector('a[href="/"]');
    if (homeLink) {
      homeLink.click();
    } else {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new Event('popstate'));
    }
    setTimeout(goToSearch, 300);
  }

  function waitForCapture(timeoutMs) {
    return new Promise(resolve => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (capturedHeaders) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function ensureSessionAtStart(updateStatusFn) {
    extractLocationFromEnv();
    if (capturedHeaders) return true;
    updateStatusFn('Syncing secure session...');
    installOmniCatcher();
    triggerPhantomNavigation();
    const success = await waitForCapture(5000);
    if (success) updateStatusFn('Session synced successfully.');
    else updateStatusFn('Session timeout. Fetching limited.');
    await new Promise(r => setTimeout(r, 600)); 
    return success;
  }

  // ================== Parsing & Caching ==================
  function cacheGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function cacheSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function isFresh(cachedAt, ttlMs) { return cachedAt && (Date.now() - cachedAt < ttlMs); }

  function extractJsonObjects(text, marker) {
    const results = [];
    let searchFrom = 0;
    while (true) {
      const start = text.indexOf(marker, searchFrom);
      if (start === -1) break;
      const slice = extractBalancedObjectAt(text, start);
      if (slice) {
        try { results.push(JSON.parse(slice)); } catch (e) {}
        searchFrom = start + slice.length;
      } else searchFrom = start + marker.length;
    }
    return results;
  }

  function extractBalancedObjectAt(text, start) {
    if (text[start] !== '{') return null;
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }

  function slugify(name) { return (name || '').toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, ''); }

  // ================== Fetchers (RSC & BFF) ==================
  async function fetchZeptoPage(path, attempt = 1) {
    const url = 'https://www.zepto.com' + path;
    let res = await fetch(url, { credentials: 'include', headers: { accept: '*/*', rsc: '1' } });
    let text = await res.text();
    const redirectMatch = text.match(/NEXT_REDIRECT;(?:replace|push);([^;]+);/);
    if (redirectMatch && attempt < 3) return fetchZeptoPage(redirectMatch[1], attempt + 1);
    if (!res.ok || text.length < 200) {
      res = await fetch(url, { credentials: 'include' });
      text = await res.text();
    }
    if (!res.ok) throw new Error(`[zdeals] fetch failed: ${res.status}`);
    return text;
  }

  async function fetchAllCategoriesRaw() {
    const text = await fetchZeptoPage(`/pip/all-categories/${ALL_CATEGORIES_LAYOUT_ID}`);
    const tiles = extractJsonObjects(text, '{"deeplinkUrl"');
    const categories = [];
    for (const tile of tiles) {
      const m = /Categories\?categoryId=([0-9a-f-]{36})&subCategoryId=([0-9a-f-]{36})/.exec(tile.deeplinkUrl || '');
      if (m) categories.push({ name: tile.name, categoryId: m[1], subCategoryId: m[2] });
    }
    return { categories };
  }

  async function getCategories(forceRefresh) {
    if (!forceRefresh) {
      const cached = cacheGet(CATEGORIES_KEY);
      if (cached && isFresh(cached.cachedAt, CATEGORY_TTL_MS)) return cached.categories;
    }
    const { categories } = await fetchAllCategoriesRaw();
    cacheSet(CATEGORIES_KEY, { categories, cachedAt: Date.now() });
    return categories;
  }

  async function getSubcategories(category, forceRefresh) {
    const key = SUBCATS_PREFIX + category.categoryId;
    if (!forceRefresh) {
      const cached = cacheGet(key);
      if (cached && isFresh(cached.cachedAt, CATEGORY_TTL_MS)) return cached.tabs;
    }
    const slug = slugify(category.name);
    const text = await fetchZeptoPage(`/cn/${slug}/all/cid/${category.categoryId}/scid/${category.subCategoryId}`);
    const tabs = extractJsonObjects(text, '{"activeIcon"')
      .map(t => t.params ? { title: t.title, categoryId: t.params.category_id, subCategoryId: t.params.subcategory_id } : null)
      .filter(Boolean);
    
    if (tabs.length > 0) cacheSet(key, { tabs, cachedAt: Date.now() });
    return tabs;
  }

  async function fetchBffPage(body) {
    const reqHeaders = Object.assign({}, capturedHeaders, { 'content-type': 'application/json' });
    const res = await fetch('https://bff-gateway.zepto.com/lms/api/v2/get_page', {
      method: 'POST', headers: reqHeaders, credentials: 'include', mode: 'cors',
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('BFF HTTP ' + res.status);
    return res.json();
  }

  // Resilient recursive product extractor across all layout widgets with image & OOS parsing
  function extractProductsFromWidgets(widgets, category, subcategory) {
    const products = [];
    const seenPvid = new Set();

    function traverse(list) {
      if (!Array.isArray(list)) return;
      for (const w of list) {
        if (!w) continue;
        
        const items = (w.data && Array.isArray(w.data.items)) ? w.data.items : (w.data && Array.isArray(w.data.products) ? w.data.products : []);
        
        for (const p of items) {
          if (!p || !p.product) continue;
          
          const pvid = (p.productVariant && p.productVariant.id) || p.id || p.product.id;
          if (pvid && seenPvid.has(pvid)) continue;
          if (pvid) seenPvid.add(pvid);

          // Accurate Out-of-Stock check
          const isOutOfStock = Boolean(
            p.outOfStock || 
            (p.productVariant && p.productVariant.outOfStock) || 
            p.isOutOfStock ||
            (p.productVariant && p.productVariant.inventory && p.productVariant.inventory.quantity <= 0) ||
            (p.productVariant && p.productVariant.quantity === 0) ||
            p.availableQuantity === 0 ||
            (p.productVariant && p.productVariant.isActive === false) ||
            p.isActive === false
          );

          const mrp = (p.mrp || 0) / 100;
          const price = (p.discountedSellingPrice || p.sellingPrice || p.mrp || 0) / 100;
          let discountPercent = p.discountPercent;
          if ((discountPercent === undefined || discountPercent === null) && mrp > 0 && price > 0 && mrp > price) {
            discountPercent = Math.round(((mrp - price) / mrp) * 100);
          }

          // We extract all items with a discount (including OOS items to display per user request)
          if (discountPercent > 0) {
            const productSlug = (p.product && p.product.slug) || slugify(p.product.name);
            const variantId = (p.productVariant && p.productVariant.id) || '';
            const productUrl = variantId ? `https://www.zepto.com/pn/${productSlug}/pvid/${variantId}` : `https://www.zepto.com/pn/${productSlug}`;

            // Resolve Image URL
            let imgPath = '';
            if (p.productVariant && Array.isArray(p.productVariant.images) && p.productVariant.images.length > 0) {
              imgPath = p.productVariant.images[0].path || p.productVariant.images[0].name || '';
            } else if (p.product && Array.isArray(p.product.images) && p.product.images.length > 0) {
              imgPath = p.product.images[0].path || p.product.images[0].name || '';
            } else if (Array.isArray(p.images) && p.images.length > 0) {
              imgPath = p.images[0].path || p.images[0].url || '';
            } else if (p.image) {
              imgPath = typeof p.image === 'string' ? p.image : (p.image.path || '');
            }

            let imageUrl = '';
            if (imgPath) {
              if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
                imageUrl = imgPath;
              } else {
                const cleanPath = imgPath.startsWith('/') ? imgPath.slice(1) : imgPath;
                imageUrl = `https://cdn.zeptonow.com/production/ik-seo/tr:w-360,f-auto,q-70/${cleanPath}`;
              }
            }

            products.push({
              name: (p.product && p.product.name) || '',
              brand: (p.product && p.product.brand) || '',
              packSize: (p.productVariant && p.productVariant.formattedPacksize) || '',
              mrp: mrp,
              price: price,
              discountPercent: discountPercent,
              category: category.name,
              subcategory: subcategory.title,
              url: productUrl,
              imageUrl: imageUrl,
              isOutOfStock: isOutOfStock
            });
          }
        }

        if (w.widgets && Array.isArray(w.widgets)) traverse(w.widgets);
        if (w.data && w.data.widgets && Array.isArray(w.data.widgets)) traverse(w.data.widgets);
      }
    }

    traverse(widgets);
    return products;
  }

  async function getDeals(category, subcategory, updateStatusFn) {
    if (!capturedHeaders) {
      throw new Error('[zdeals] no session headers captured — cannot fetch deals');
    }

    const products = [];
    let body = {
      page_type: 'SUBCATEGORY', version: 'v2',
      latitude: (capturedLocation && capturedLocation.latitude) ? capturedLocation.latitude : DEFAULT_LATITUDE,
      longitude: (capturedLocation && capturedLocation.longitude) ? capturedLocation.longitude : DEFAULT_LONGITUDE,
      category_id: category.categoryId, subcategory_id: subcategory.subCategoryId,
      page_size: 20, page_identifier: 'browse_category_product',
      filter_id: '0', subcategory_intent_id: '0',
      ads_end_range: 0, ads_start_range: 0, atlas_offset: 0,
      disable_tabs: true, eta_raining: false, infinite_feed_widget_id: 0,
      is_continuous_feed: true, last_widget_id: 0, oos_end_range: 0, oos_start_range: 0, page_number: 1
    };

    let page = 1;
    while (page <= MAX_PAGES_PER_SUBCAT) {
      updateStatusFn(`Extracting: ${subcategory.title} (Page ${page})`);
      if (page > 1) {
        await new Promise(r => setTimeout(r, 500 + Math.random() * 700));
      }

      let data;
      try {
        data = await fetchBffPage(body);
      } catch (e) {
        break;
      }

      const widgets = (data.pageLayout && data.pageLayout.widgets) || [];
      products.push(...extractProductsFromWidgets(widgets, category, subcategory));

      const endOfPage = data.pageLayout && data.pageLayout.endOfPage;
      const nextParams = data.pageLayout && data.pageLayout.nextPageParams;
      if (endOfPage || !nextParams) break;

      body = Object.assign({}, body, nextParams);
      page++;
    }
    return products;
  }

  async function getDealsForSelection(selections, updateStatusFn) {
    const all = [];
    for (let i = 0; i < selections.length; i++) {
      if (i > 0) {
        await new Promise(r => setTimeout(r, 600 + Math.random() * 800));
      }
      const { category, subcategory } = selections[i];
      const products = await getDeals(category, subcategory, updateStatusFn);
      all.push(...products);
    }
    return all.sort((a, b) => b.discountPercent - a.discountPercent);
  }

  // ================== Zepto Grid Results Rendering ==================
  function openResultsTab(title, products) {
    const subcats = Array.from(new Set(products.map(p => p.subcategory).filter(Boolean)));
    const subcatOptions = subcats.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

    const inStockCount = products.filter(p => !p.isOutOfStock).length;
    const oosCount = products.filter(p => p.isOutOfStock).length;

    const cardsHtml = products.map(p => `
      <div class="product-card ${p.isOutOfStock ? 'oos' : ''}" 
           data-name="${escapeHtml(p.name)}" 
           data-brand="${escapeHtml(p.brand)}" 
           data-subcat="${escapeHtml(p.subcategory)}" 
           data-mrp="${p.mrp}" 
           data-price="${p.price}" 
           data-discount="${p.discountPercent}" 
           data-oos="${p.isOutOfStock ? '1' : '0'}"
           data-url="${escapeHtml(p.url || '#')}">
        
        <div class="card-badges">
          ${p.isOutOfStock ? `<span class="badge-oos">OUT OF STOCK</span>` : `<span></span>`}
          <span class="badge-discount">${p.discountPercent}% OFF</span>
        </div>

        <a href="${escapeHtml(p.url || '#')}" target="_blank" rel="noopener noreferrer" class="card-image-wrap" title="View ${escapeHtml(p.name)} on Zepto">
          <img src="${p.imageUrl || 'https://cdn.zeptonow.com/web-static-assets-prod/artifacts/16.25.0/favicon.png'}" 
               alt="${escapeHtml(p.name)}" 
               class="prod-img" 
               loading="lazy" 
               onerror="this.onerror=null;this.src='https://cdn.zeptonow.com/web-static-assets-prod/artifacts/16.25.0/favicon.png';this.style.objectFit='contain';">
        </a>

        <div class="card-body">
          <div class="card-meta">
            <span class="badge-subcat">${escapeHtml(p.subcategory)}</span>
            ${p.packSize ? `<span class="pack-size">${escapeHtml(p.packSize)}</span>` : ''}
          </div>
          
          <a href="${escapeHtml(p.url || '#')}" target="_blank" rel="noopener noreferrer" class="prod-title" title="${escapeHtml(p.name)}">
            ${escapeHtml(p.name)}
          </a>
          
          ${p.brand ? `<div class="prod-brand">${escapeHtml(p.brand)}</div>` : ''}

          <div class="price-row">
            <div class="price-main">
              <span class="selling-price">₹${p.price.toFixed(2)}</span>
              <span class="mrp-price">₹${p.mrp.toFixed(2)}</span>
            </div>
            ${(p.mrp > p.price) ? `<div class="save-badge">Save ₹${(p.mrp - p.price).toFixed(2)}</div>` : ''}
          </div>
        </div>

        <a href="${escapeHtml(p.url || '#')}" target="_blank" rel="noopener noreferrer" class="card-btn ${p.isOutOfStock ? 'btn-oos' : ''}">
          ${p.isOutOfStock ? 'Out of Stock ↗' : 'View on Zepto ↗'}
        </a>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Zepto Deals</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px 18px; background: #f8fafc; color: #0f172a; }
  .container { max-width: 1440px; margin: 0 auto; }
  
  /* Header Area */
  .header-card { 
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; 
    padding: 20px 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px;
  }
  .brand-tag {
    display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em; color: #0c831f; background: #ecfdf5;
    padding: 3px 10px; border-radius: 9999px; margin-bottom: 6px;
  }
  h1 { font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
  .meta-info { font-size: 13.5px; color: #64748b; font-weight: 500; margin-top: 3px; }
  
  .actions-group { display: flex; align-items: center; gap: 12px; }
  .btn-export {
    display: inline-flex; align-items: center; gap: 8px; background: #0f172a; color: #ffffff;
    padding: 10px 18px; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer;
    border: none; transition: all 0.2s ease; text-decoration: none; box-shadow: 0 2px 4px rgba(0,0,0,0.06);
  }
  .btn-export:hover { background: #334155; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }

  /* Filters Bar */
  .controls-bar {
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;
    padding: 16px 20px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
  }
  
  .search-wrap {
    flex: 2; min-width: 260px; position: relative;
  }
  .search-wrap svg {
    position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none;
  }
  input#search {
    width: 100%; padding: 10px 14px 10px 38px; font-size: 14px; font-family: inherit;
    border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; color: #0f172a;
    transition: all 0.2s ease; outline: none;
  }
  input#search:focus { background: #ffffff; border-color: #0c831f; box-shadow: 0 0 0 3px rgba(12, 131, 31, 0.12); }
  
  .dropdown-group {
    display: flex; flex-wrap: wrap; gap: 10px; flex: 3; min-width: 320px;
  }
  .filter-item {
    display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 140px;
  }
  .filter-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;
  }
  select.filter-select {
    width: 100%; padding: 9px 12px; font-size: 13.5px; font-family: inherit;
    border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; color: #334155;
    outline: none; cursor: pointer; transition: all 0.2s; font-weight: 500;
  }
  select.filter-select:focus { border-color: #0c831f; box-shadow: 0 0 0 3px rgba(12, 131, 31, 0.12); }

  .count-banner {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding: 0 4px;
  }
  .items-counter {
    font-size: 14px; font-weight: 600; color: #334155;
  }
  .items-counter span { color: #0c831f; font-weight: 700; }
  .stock-pill-group { display: flex; gap: 8px; }
  .stock-pill {
    font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 9999px;
  }
  .stock-pill.instock { background: #dcfce7; color: #166534; }
  .stock-pill.oos { background: #fee2e2; color: #991b1b; }

  /* Product Grid Layout - 5 Items In A Row */
  .grid-wrap {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 16px;
  }

  @media (max-width: 1300px) {
    .grid-wrap {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
    }
  }

  @media (max-width: 1100px) {
    .grid-wrap {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
  }

  @media (max-width: 860px) {
    .grid-wrap {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
  }

  @media (max-width: 600px) {
    .grid-wrap {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
  }

  /* Zepto Product Card */
  .product-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    position: relative;
    cursor: pointer;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  }
  .product-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 22px -4px rgba(15, 23, 42, 0.08);
    border-color: #cbd5e1;
  }

  /* Badges: Top Right Green Discount & Top Left OOS */
  .card-badges {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    pointer-events: none;
    z-index: 5;
  }

  .badge-discount {
    margin-left: auto;
    background: #0c831f; /* Zepto Brand Green */
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 7px;
    border-radius: 6px;
    box-shadow: 0 2px 5px rgba(12, 131, 31, 0.25);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .badge-oos {
    background: #ef4444;
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 7px;
    border-radius: 6px;
    letter-spacing: 0.04em;
    box-shadow: 0 2px 5px rgba(239, 68, 68, 0.25);
  }

  /* Out of Stock Card State */
  .product-card.oos {
    border-color: #fca5a5;
    background: #fffafa;
  }
  .product-card.oos .prod-img {
    opacity: 0.5;
    filter: grayscale(40%);
  }
  .product-card.oos .selling-price {
    color: #64748b;
  }

  /* Card Image Area (Centered) */
  .card-image-wrap {
    position: relative;
    width: 100%;
    height: 170px;
    background: #ffffff;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    margin-bottom: 10px;
    text-decoration: none;
  }
  .prod-img {
    max-width: 85%;
    max-height: 85%;
    object-fit: contain;
    margin: auto;
    display: block;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .product-card:hover .prod-img {
    transform: scale(1.06);
  }

  /* Card Body */
  .card-body {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .card-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    gap: 6px;
  }
  .badge-subcat {
    font-size: 11px;
    font-weight: 600;
    background: #f1f5f9;
    color: #475569;
    padding: 2px 6px;
    border-radius: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pack-size {
    font-size: 11.5px;
    color: #64748b;
    font-weight: 500;
    white-space: nowrap;
  }

  .prod-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #0f172a;
    text-decoration: none;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 36px;
    margin-bottom: 4px;
    transition: color 0.15s;
  }
  .prod-title:hover {
    color: #0c831f;
  }
  .prod-brand {
    font-size: 11.5px;
    color: #94a3b8;
    font-weight: 600;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* Price Area */
  .price-row {
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px dashed #f1f5f9;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 10px;
  }
  .price-main {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }
  .selling-price {
    font-size: 17px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }
  .mrp-price {
    font-size: 12.5px;
    color: #94a3b8;
    text-decoration: line-through;
    font-weight: 500;
  }
  .save-badge {
    font-size: 11px;
    font-weight: 700;
    color: #15803d;
    background: #dcfce7;
    padding: 2px 6px;
    border-radius: 5px;
  }

  /* Action CTA */
  .card-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.15s;
    background: #f1f5f9;
    color: #1e293b;
    border: 1px solid #e2e8f0;
  }
  .card-btn:hover {
    background: #0c831f;
    color: #ffffff;
    border-color: #0c831f;
  }
  .card-btn.btn-oos {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fecaca;
  }
  .card-btn.btn-oos:hover {
    background: #fee2e2;
    color: #991b1b;
  }

  /* Empty state */
  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 60px 20px;
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    color: #64748b;
    display: none;
  }
  .empty-state h3 { font-size: 18px; color: #1e293b; margin-bottom: 6px; }

  @media (max-width: 768px) {
    body { padding: 16px 12px; }
    .header-card { padding: 16px; }
    .controls-bar { flex-direction: column; align-items: stretch; }
    .dropdown-group { min-width: auto; }
    .grid-wrap { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .card-image-wrap { height: 140px; }
    .selling-price { font-size: 16px; }
  }
</style>
</head>
<body>
  <div class="container">
    
    <!-- Top Header -->
    <div class="header-card">
      <div>
        <div class="brand-tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          Zepto Deals Hub
        </div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta-info">Real-time discounted inventory extracted directly from Zepto</div>
      </div>
      <div class="actions-group">
        <button id="btn-export-csv" class="btn-export">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Export CSV
        </button>
      </div>
    </div>

    <!-- Filters & Controls Bar -->
    <div class="controls-bar">
      <div class="search-wrap">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input id="search" type="text" placeholder="Search by product name or brand...">
      </div>

      <div class="dropdown-group">
        <div class="filter-item">
          <label class="filter-label" for="filter-subcat">Category</label>
          <select id="filter-subcat" class="filter-select">
            <option value="">All Subcategories</option>
            ${subcatOptions}
          </select>
        </div>

        <div class="filter-item">
          <label class="filter-label" for="filter-min-discount">Min Discount</label>
          <select id="filter-min-discount" class="filter-select">
            <option value="0">All Discounts</option>
            <option value="15">15%+ Off</option>
            <option value="25">25%+ Off</option>
            <option value="35">35%+ Off</option>
            <option value="50">50%+ Off</option>
            <option value="70">70%+ Off</option>
          </select>
        </div>

        <div class="filter-item">
          <label class="filter-label" for="filter-availability">Availability</label>
          <select id="filter-availability" class="filter-select">
            <option value="all">All Items</option>
            <option value="instock">In Stock Only</option>
            <option value="oos">Out of Stock Only</option>
          </select>
        </div>

        <div class="filter-item">
          <label class="filter-label" for="filter-sort">Sort By</label>
          <select id="filter-sort" class="filter-select">
            <option value="discount-desc">Discount: High to Low</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="mrp-desc">MRP: High to Low</option>
            <option value="name-asc">Name: A to Z</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Count Summary -->
    <div class="count-banner">
      <div class="items-counter">
        Showing <span id="visible-count">${products.length}</span> of ${products.length} items
      </div>
      <div class="stock-pill-group">
        <span class="stock-pill instock">${inStockCount} In Stock</span>
        <span class="stock-pill oos">${oosCount} Out of Stock</span>
      </div>
    </div>

    <!-- Product Grid -->
    <div class="grid-wrap" id="product-grid">
      ${cardsHtml}
      <div class="empty-state" id="empty-state">
        <h3>No matching deals found</h3>
        <p>Try adjusting your search query, discount threshold, or category filter.</p>
      </div>
    </div>

  </div>

<script>
  const rawProducts = ${JSON.stringify(products)};
  const grid = document.getElementById('product-grid');
  const searchInput = document.getElementById('search');
  const subcatSelect = document.getElementById('filter-subcat');
  const discountSelect = document.getElementById('filter-min-discount');
  const availabilitySelect = document.getElementById('filter-availability');
  const sortSelect = document.getElementById('filter-sort');
  const visibleCountEl = document.getElementById('visible-count');
  const emptyStateEl = document.getElementById('empty-state');

  const allCards = Array.from(grid.querySelectorAll('.product-card'));

  function applyFiltersAndSort() {
    const q = (searchInput.value || '').toLowerCase().trim();
    const selectedSubcat = subcatSelect.value;
    const minDisc = parseFloat(discountSelect.value) || 0;
    const availMode = availabilitySelect.value;
    const sortMode = sortSelect.value;

    let visibleCards = [];

    allCards.forEach(card => {
      const name = (card.getAttribute('data-name') || '').toLowerCase();
      const brand = (card.getAttribute('data-brand') || '').toLowerCase();
      const subcat = card.getAttribute('data-subcat') || '';
      const disc = parseFloat(card.getAttribute('data-discount')) || 0;
      const isOOS = card.getAttribute('data-oos') === '1';

      const matchesSearch = !q || name.includes(q) || brand.includes(q);
      const matchesSubcat = !selectedSubcat || subcat === selectedSubcat;
      const matchesDiscount = disc >= minDisc;
      const matchesAvail = (availMode === 'all') || 
                           (availMode === 'instock' && !isOOS) || 
                           (availMode === 'oos' && isOOS);

      if (matchesSearch && matchesSubcat && matchesDiscount && matchesAvail) {
        card.style.display = 'flex';
        visibleCards.push(card);
      } else {
        card.style.display = 'none';
      }
    });

    // Apply Sorting
    visibleCards.sort((a, b) => {
      const priceA = parseFloat(a.getAttribute('data-price')) || 0;
      const priceB = parseFloat(b.getAttribute('data-price')) || 0;
      const mrpA = parseFloat(a.getAttribute('data-mrp')) || 0;
      const mrpB = parseFloat(b.getAttribute('data-mrp')) || 0;
      const discA = parseFloat(a.getAttribute('data-discount')) || 0;
      const discB = parseFloat(b.getAttribute('data-discount')) || 0;
      const nameA = (a.getAttribute('data-name') || '').toLowerCase();
      const nameB = (b.getAttribute('data-name') || '').toLowerCase();

      switch (sortMode) {
        case 'price-asc': return priceA - priceB;
        case 'price-desc': return priceB - priceA;
        case 'mrp-desc': return mrpB - mrpA;
        case 'name-asc': return nameA.localeCompare(nameB);
        case 'discount-desc':
        default:
          return discB - discA;
      }
    });

    visibleCards.forEach(card => grid.appendChild(card));
    grid.appendChild(emptyStateEl);

    visibleCountEl.textContent = visibleCards.length;
    emptyStateEl.style.display = visibleCards.length === 0 ? 'block' : 'none';
  }

  searchInput.addEventListener('input', applyFiltersAndSort);
  subcatSelect.addEventListener('change', applyFiltersAndSort);
  discountSelect.addEventListener('change', applyFiltersAndSort);
  availabilitySelect.addEventListener('change', applyFiltersAndSort);
  sortSelect.addEventListener('change', applyFiltersAndSort);

  // Open Product on Zepto when clicking anywhere on the card
  grid.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    const card = e.target.closest('.product-card');
    if (card) {
      const url = card.getAttribute('data-url');
      if (url && url !== '#') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  });

  // CSV Export
  document.getElementById('btn-export-csv').addEventListener('click', function () {
    const visibleData = [];
    allCards.forEach((card, i) => {
      if (card.style.display !== 'none') {
        const p = rawProducts[i];
        if (p) visibleData.push(p);
      }
    });

    if (visibleData.length === 0) {
      alert('No visible products to export.');
      return;
    }

    const headers = ['Product Name', 'Brand', 'Category', 'Subcategory', 'Pack Size', 'MRP (INR)', 'Selling Price (INR)', 'Discount (%)', 'Status', 'Product URL'];
    const csvRows = [headers.join(',')];

    visibleData.forEach(p => {
      const row = [
        '"' + (p.name || '').replace(/"/g, '""') + '"',
        '"' + (p.brand || '').replace(/"/g, '""') + '"',
        '"' + (p.category || '').replace(/"/g, '""') + '"',
        '"' + (p.subcategory || '').replace(/"/g, '""') + '"',
        '"' + (p.packSize || '').replace(/"/g, '""') + '"',
        p.mrp.toFixed(2),
        p.price.toFixed(2),
        p.discountPercent,
        p.isOutOfStock ? '"Out of Stock"' : '"In Stock"',
        '"' + (p.url || '').replace(/"/g, '""') + '"'
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'zepto_deals_' + new Date().toISOString().slice(0, 10) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
<\/script>
</body>
</html>`;

    // Use Blob URL for CSP resilience and standard popup-blocker friendliness
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  }

  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ================== Panel UI ==================
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #zdeals-fab { position: fixed; bottom: 32px; right: 32px; z-index: 999999; width: 54px; height: 54px; border-radius: 50%; border: 1px solid #e2e8f0; cursor: pointer; background: #ffffff; color: #4f46e5; font-size: 24px; box-shadow: 0 4px 14px rgba(0,0,0,0.1); transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; }
      #zdeals-fab:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.14); border-color: #cbd5e1; }
      #zdeals-panel { position: fixed; bottom: 100px; right: 32px; z-index: 999999; width: 360px; max-width: 90vw; max-height: 75vh; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; display: none; flex-direction: column; overflow: hidden; }
      #zdeals-panel.open { display: flex; }
      #zdeals-panel * { box-sizing: border-box; }
      #zdeals-panel .zd-header { padding: 16px 20px; font-weight: 600; color: #0f172a; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; }
      #zdeals-panel .zd-refresh { cursor: pointer; font-size: 12px; color: #64748b; font-weight: 500; padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; transition: all 0.2s; }
      #zdeals-panel .zd-refresh:hover { background: #f1f5f9; color: #0f172a; }
      #zdeals-body { overflow-y: auto; flex: 1; background: #ffffff; }
      #zdeals-panel .zd-cat { padding: 12px 20px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; font-weight: 500; color: #334155; transition: background 0.15s; }
      #zdeals-panel .zd-cat:hover { background: #f8fafc; }
      #zdeals-panel .zd-cat .zd-chevron { transition: transform 0.2s ease; color: #94a3b8; font-size: 11px; }
      #zdeals-panel .zd-cat.expanded .zd-chevron { transform: rotate(90deg); }
      #zdeals-panel .zd-subcat-list { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
      #zdeals-panel .zd-subcat { padding: 10px 20px 10px 32px; display: flex; align-items: center; gap: 12px; cursor: pointer; color: #475569; font-size: 13.5px; transition: background 0.15s; }
      #zdeals-panel .zd-subcat:hover { background: #f1f5f9; color: #0f172a; }
      #zdeals-panel .zd-subcat input[type=checkbox] { width: 16px; height: 16px; accent-color: #6366f1; cursor: pointer; flex-shrink: 0; margin: 0; border: 1px solid #cbd5e1; border-radius: 4px; }
      #zdeals-panel .zd-subcat.disabled { opacity: 0.5; cursor: not-allowed; }
      #zdeals-panel .zd-loading { padding: 18px 20px; color: #64748b; font-size: 13.5px; text-align: center; }
      #zdeals-footer { padding: 16px 20px; border-top: 1px solid #e2e8f0; background: #f8fafc; }
      #zdeals-fetch-btn { width: 100%; padding: 12px; border: none; border-radius: 8px; background: #6366f1; color: #ffffff; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
      #zdeals-fetch-btn:disabled { background: #cbd5e1; color: #94a3b8; cursor: not-allowed; box-shadow: none; }
      #zdeals-fetch-btn:not(:disabled):hover { background: #4f46e5; }
      #zdeals-fetch-btn[data-state="ready"] { background: #10b981; }
      #zdeals-fetch-btn[data-state="ready"]:hover { background: #059669; }
      @media (max-width: 480px) { #zdeals-panel { right: 16px; left: 16px; width: auto; bottom: 90px; } #zdeals-fab { right: 16px; bottom: 16px; } }
    `;
    document.head.appendChild(style);
  }

  const selections = new Map();
  function selectionCountForCategory(categoryId) { return selections.has(categoryId) ? selections.get(categoryId).subcats.size : 0; }
  function totalSelectionCount() { let n = 0; selections.forEach(e => n += e.subcats.size); return n; }

  function resetFetchButton() {
    const btn = document.getElementById('zdeals-fetch-btn');
    btn.dataset.state = '';
    btn.style.background = '';
    const n = totalSelectionCount();
    btn.textContent = n > 0 ? `Fetch Deals (${n} selected)` : 'Select subcategories';
    btn.disabled = n === 0;
  }

  function toggleSelection(category, subcategory, checked) {
    if (checked) {
      if (!selections.has(category.categoryId)) selections.set(category.categoryId, { category, subcats: new Map() });
      selections.get(category.categoryId).subcats.set(subcategory.subCategoryId, subcategory);
    } else {
      const entry = selections.get(category.categoryId);
      if (entry) {
        entry.subcats.delete(subcategory.subCategoryId);
        if (entry.subcats.size === 0) selections.delete(category.categoryId);
      }
    }
    resetFetchButton();
  }

  function refreshDisabledState(subListEl, category) {
    const atLimit = selectionCountForCategory(category.categoryId) >= MAX_SELECTED_PER_CATEGORY;
    subListEl.querySelectorAll('.zd-subcat').forEach(row => {
      const cb = row.querySelector('input[type=checkbox]');
      if (!cb.checked) { row.classList.toggle('disabled', atLimit); cb.disabled = atLimit; }
    });
  }

  function buildPanel() {
    const fab = document.createElement('button');
    fab.id = 'zdeals-fab'; fab.innerHTML = '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'zdeals-panel';
    panel.innerHTML = '<div class="zd-header"><span>Zepto Deals</span><button class="zd-refresh" id="zdeals-refresh">Reset</button></div><div id="zdeals-body"></div><div id="zdeals-footer"><button id="zdeals-fetch-btn" disabled>Select subcategories</button></div>';
    document.body.appendChild(panel);

    fab.addEventListener('click', async () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open') && !document.getElementById('zdeals-body').dataset.loaded) {
        document.getElementById('zdeals-body').innerHTML = '<div class="zd-loading">Warming up session...</div>';
        await ensureSessionAtStart(msg => {
            const b = document.getElementById('zdeals-body');
            if (b) b.innerHTML = `<div class="zd-loading">${msg}</div>`;
        });
        await loadCategoryList(false);
        document.getElementById('zdeals-body').dataset.loaded = '1';
      }
    });

    document.getElementById('zdeals-refresh').addEventListener('click', async (e) => {
      e.stopPropagation();
      selections.clear();
      resetFetchButton();
      await loadCategoryList(true);
    });

    const fetchBtn = document.getElementById('zdeals-fetch-btn');
    fetchBtn.addEventListener('click', async () => {
      
      // STEP 2: Data is ready, open tab synchronously without popup blocker interference
      if (fetchBtn.dataset.state === 'ready') {
        const title = flatSelectionsData.length === 1 ? `${flatSelectionsData[0].category.name} — ${flatSelectionsData[0].subcategory.title}` : `Zepto Deals (${flatSelectionsData.length} subcategories)`;
        openResultsTab(title, fetchedProductsData);
        return;
      }

      // STEP 1: The user clicked Fetch. Run the async pagination loops.
      const flat = [];
      selections.forEach(entry => entry.subcats.forEach(subcategory => flat.push({ category: entry.category, subcategory })));
      if (flat.length === 0) return;

      selections.clear();
      document.querySelectorAll('#zdeals-body .zd-subcat').forEach(row => {
        row.classList.remove('disabled');
        const cb = row.querySelector('input[type=checkbox]');
        if (cb) { cb.checked = false; cb.disabled = false; }
      });

      fetchBtn.disabled = true;
      
      const updateStatus = (msg) => { fetchBtn.textContent = msg; };

      try {
        if (!capturedHeaders) {
          await ensureSessionAtStart(updateStatus);
        }
        fetchedProductsData = await getDealsForSelection(flat, updateStatus);
        flatSelectionsData = flat;
        
        fetchBtn.dataset.state = 'ready';
        fetchBtn.textContent = `View Results (${fetchedProductsData.length} deals)`;
        fetchBtn.disabled = false;
      } catch (err) {
        console.error('[zdeals]', err);
        fetchBtn.textContent = 'Error. Please retry.';
        setTimeout(resetFetchButton, 2000);
      }
    });
  }

  async function loadCategoryList(forceRefresh) {
    const body = document.getElementById('zdeals-body');
    body.innerHTML = '<div class="zd-loading">Loading categories...</div>';
    try {
      const categories = await getCategories(forceRefresh);
      body.innerHTML = '';
      categories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'zd-cat'; row.innerHTML = `<span>${escapeHtml(cat.name)}</span><span class="zd-chevron">▶</span>`;
        let expanded = false, subListEl = null;

        row.addEventListener('click', async () => {
          if (expanded) { subListEl.remove(); row.classList.remove('expanded'); expanded = false; return; }
          expanded = true; row.classList.add('expanded');
          subListEl = document.createElement('div'); subListEl.className = 'zd-subcat-list';
          subListEl.innerHTML = '<div class="zd-loading">Loading subcategories...</div>';
          row.insertAdjacentElement('afterend', subListEl);

          try {
            const subs = await getSubcategories(cat);
            subListEl.innerHTML = '';
            subs.forEach(sub => {
              const subRow = document.createElement('label'); subRow.className = 'zd-subcat';
              const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
              checkbox.addEventListener('change', () => {
                if (checkbox.checked && selectionCountForCategory(cat.categoryId) >= MAX_SELECTED_PER_CATEGORY) { 
                  checkbox.checked = false; 
                  return; 
                }
                toggleSelection(cat, sub, checkbox.checked);
                refreshDisabledState(subListEl, cat);
              });
              subRow.appendChild(checkbox); subRow.appendChild(document.createTextNode(sub.title));
              subRow.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.target !== checkbox && !subRow.classList.contains('disabled')) {
                  checkbox.checked = !checkbox.checked; checkbox.dispatchEvent(new Event('change'));
                }
              });
              subListEl.appendChild(subRow);
            });
          } catch (err) { subListEl.innerHTML = '<div class="zd-loading">Failed to load subcategories</div>'; }
        });
        body.appendChild(row);
      });
    } catch (err) { body.innerHTML = '<div class="zd-loading">Failed to load categories</div>'; }
  }

  // ================== Boot ==================
  injectStyles();
  buildPanel();
})();
