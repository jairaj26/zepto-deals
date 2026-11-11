/**
 * Zepto Discount Distribution Analyzer
 * --------------------------------------
 * Run this in the DevTools console on https://www.zepto.com
 * 
 * Tests whether Zepto's search feed concentrates high-discount deals on early pages,
 * or whether deep pagination is actually necessary to find the best deals.
 */
(async function analyzeZeptoDiscounts() {
  // ==================== CONFIGURATION ====================
  const KEYWORD = 'Sweets';  // Change to any search keyword (e.g. 'Sweets', 'Snacks', 'Oil', 'Chocolates')
  const MAX_PAGES = 10;      // Maximum number of pages to scan (Zepto pages are 0-indexed)
  const DELAY_MS = 600;      // Polite delay between requests
  const FALLBACK_STORE_ID = 'c48dd700-4314-4cc1-bffa-e1344e0298dc';
  // =======================================================

  console.log(`%c[Zepto Analyzer] Starting page-by-page discount scan for "${KEYWORD}" (up to ${MAX_PAGES} pages)...`, 'color: #7a14ac; font-weight: bold; font-size: 14px;');

  function getCookie(name) {
    try {
      const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, '\\$&') + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : '';
    } catch (e) {
      return '';
    }
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  async function sha256Hex(str) {
    const buffer = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function findStoreId() {
    const fromCookie = getCookie('store_id') || getCookie('storeId');
    if (fromCookie && fromCookie.length > 10) return fromCookie;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const val = localStorage.getItem(localStorage.key(i));
        if (!val) continue;
        const m = val.match(/"(?:primaryStore|store|primaryStoreId|storeId|store_id)"\s*:\s*(?:\{[^}]*"storeId"\s*:\s*)?"([a-f0-9\-]{36})"/i);
        if (m && m[1]) return m[1];
      }
    } catch (e) {}
    return FALLBACK_STORE_ID;
  }

  const storeId = findStoreId();
  const xsrfToken = getCookie('XSRF-TOKEN');
  const sessionId = getCookie('session_id') || generateUUID();
  const deviceId = getCookie('unique_browser_id') || generateUUID();
  const COMPATIBLE_COMPONENTS = ',NEW_BILL_INFO,SUPERSTORE_V1,ZEPTO_PASS:5,SUPER_SAVER:1,';
  const urlPath = '/user-search-service/api/v3/search';

  console.log(`[Zepto Analyzer] Store ID: %c${storeId}`, 'color: #0c831f; font-weight: bold;');

  // Storage for analysis
  const pageStats = [];
  const allProducts = [];
  const globalSeenIds = new Set();

  for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
    const displayPage = pageNum + 1;
    console.log(`%cFetching Page ${displayPage}...`, 'color: #3b82f6;');

    if (pageNum > 0) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    const requestId = generateUUID();
    const requestBody = {
      query: KEYWORD,
      pageNumber: pageNum,
      intentId: generateUUID(),
      mode: 'AUTOSUGGEST',
      userSessionId: sessionId
    };
    const bodyStr = JSON.stringify(requestBody);

    const signParams = { body: bodyStr, deviceId, method: 'post', requestId, secret: xsrfToken || '', url: urlPath };
    const paramStr = Object.keys(signParams).sort().reduce((acc, k, idx) => acc + (idx === 0 ? '' : '|') + signParams[k], '');
    const signature = await sha256Hex(paramStr);
    const timezone = await sha256Hex(signature);

    let res;
    try {
      res = await fetch('https://bff-gateway.zepto.com' + urlPath, {
        method: 'POST',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'content-type': 'application/json',
          'app_sub_platform': 'WEB',
          'app_version': '17.6.3',
          'appversion': '17.6.3',
          'auth_from_cookie': 'true',
          'auth_revamp_flow': 'v2',
          'compatible_components': COMPATIBLE_COMPONENTS,
          'marketplace_type': 'SUPER_SAVER',
          'platform': 'WEB',
          'source': 'DIRECT',
          'tenant': 'ZEPTO',
          'device_id': deviceId,
          'deviceid': deviceId,
          'session_id': sessionId,
          'sessionid': sessionId,
          'store_id': storeId,
          'storeid': storeId,
          'store_ids': storeId,
          'x-xsrf-token': xsrfToken,
          'request-signature': signature,
          'x-timezone': timezone,
          'request_id': requestId,
          'requestid': requestId,
          'x-without-bearer': 'true'
        },
        credentials: 'include',
        body: bodyStr
      });
    } catch (err) {
      console.error(`Network error on page ${displayPage}:`, err);
      break;
    }

    if (!res.ok) {
      console.warn(`HTTP ${res.status} on page ${displayPage}. Ending pagination.`);
      break;
    }

    const data = await res.json();
    const layout = Array.isArray(data.layout) ? data.layout : (data.pageLayout?.widgets || data.widgets || []);
    
    // Extract products on this page
    const pageProducts = [];
    const pageSeen = new Set();

    function addProduct(p, widgetName) {
      if (!p) return;
      const prod = p.product || (p.productResponse && p.productResponse.product) || (p.item && p.item.product) || p;
      const variant = p.productVariant || (p.productResponse && p.productResponse.productVariant) || (p.item && p.item.productVariant) || p;

      const mrp = (p.mrp || (variant && variant.mrp) || 0) / 100;
      const price = (p.discountedSellingPrice || p.sellingPrice || (variant && variant.discountedSellingPrice) || (variant && variant.sellingPrice) || mrp || 0) / 100;

      // Strict product validation: must have real price and mrp > 0
      if (price <= 0 || mrp <= 0) return;

      const id = (variant && variant.id) || p.id || (prod && prod.id);
      if (!id || pageSeen.has(id)) return;
      pageSeen.add(id);

      const isNewGlobal = !globalSeenIds.has(id);
      if (isNewGlobal) globalSeenIds.add(id);

      const name = (prod && prod.name) || (p && p.name) || '';
      if (!name || !name.trim()) return;

      const brand = (prod && prod.brand) || '';
      const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

      const itemRecord = {
        page: displayPage,
        id,
        name,
        brand,
        price,
        mrp,
        discountPercent,
        isNewGlobal,
        widget: widgetName
      };

      pageProducts.push(itemRecord);
      allProducts.push(itemRecord);
    }

    for (const w of layout) {
      if (!w) continue;
      const wName = w.widgetName || '';
      const wId = w.widgetId || '';

      // Skip cross-sell & non-product widgets
      if (wName.includes('CROSS_SELL') || wId.includes('CROSS_SELL')) continue;
      if (wId === 'TITLE_WIDGET' || wId === 'TOP_FILTERS_WIDGET') continue;

      const resolverItems = (w.data && w.data.resolver && w.data.resolver.data && Array.isArray(w.data.resolver.data.items))
        ? w.data.resolver.data.items
        : [];

      const directItems = (w.data && Array.isArray(w.data.items)) ? w.data.items :
                          (w.data && Array.isArray(w.data.products) ? w.data.products :
                          (Array.isArray(w.items) ? w.items :
                          (Array.isArray(w.products) ? w.products : [])));

      const rawItemList = [...resolverItems, ...directItems];

      for (const item of rawItemList) {
        if (!item) continue;
        if (item.productResponse) {
          addProduct(item.productResponse, wName);
        } else if (Array.isArray(item.items)) {
          for (const sub of item.items) {
            if (sub && sub.type === 'MEDIA_ITEM') continue;
            if (sub && sub.data && (sub.data.product || sub.data.sellingPrice || sub.data.productVariant)) {
              addProduct(sub.data, wName);
            }
          }
        } else if (item.product || item.productVariant || item.sellingPrice) {
          addProduct(item.data || item, wName);
        }
      }
    }

    if (pageProducts.length === 0) {
      console.log(`Page ${displayPage} returned 0 products. Reached end of results.`);
      break;
    }

    // Compute Page Statistics
    const discounts = pageProducts.map(p => p.discountPercent);
    const discountedOnly = discounts.filter(d => d > 0);
    const maxDiscount = discounts.length > 0 ? Math.max(...discounts) : 0;
    const avgDiscountAll = discounts.length > 0 ? Math.round(discounts.reduce((a, b) => a + b, 0) / discounts.length) : 0;
    const avgDiscountActive = discountedOnly.length > 0 ? Math.round(discountedOnly.reduce((a, b) => a + b, 0) / discountedOnly.length) : 0;

    const deals70 = pageProducts.filter(p => p.discountPercent >= 70).length;
    const deals50 = pageProducts.filter(p => p.discountPercent >= 50).length;
    const deals30 = pageProducts.filter(p => p.discountPercent >= 30).length;
    const deals15 = pageProducts.filter(p => p.discountPercent >= 15).length;
    const noDiscount = pageProducts.filter(p => p.discountPercent === 0).length;

    // Find top deal on this page
    const topDeal = pageProducts.reduce((best, cur) => cur.discountPercent > (best?.discountPercent || 0) ? cur : best, null);

    pageStats.push({
      'Page #': displayPage,
      'Total Items': pageProducts.length,
      'Discounted (%)': `${Math.round((discountedOnly.length / pageProducts.length) * 100)}%`,
      'Max Disc': `${maxDiscount}%`,
      'Avg Disc (All)': `${avgDiscountAll}%`,
      'Avg Disc (Deals)': `${avgDiscountActive}%`,
      'Deals ≥50%': deals50,
      'Deals ≥30%': deals30,
      'Deals ≥15%': deals15,
      '0% Disc': noDiscount,
      'Best Deal on Page': topDeal ? `${topDeal.name.slice(0, 30)}... (${topDeal.discountPercent}% off)` : 'None'
    });

    const isEnd = Boolean(data.hasReachedEnd || data.endOfPage || data.data?.endOfPage);
    if (isEnd) {
      console.log(`Server signaled endOfPage on Page ${displayPage}.`);
      break;
    }
  }

  // ==================== REPORTING & ANALYSIS ====================
  console.log(`\n%c==================== 📊 PAGE-BY-PAGE DISCOUNT BREAKDOWN ====================`, 'color: #7a14ac; font-weight: bold; font-size: 15px;');
  console.log(`Keyword: "${KEYWORD}" | Total Unique Products Extracted: ${globalSeenIds.size}`);
  console.table(pageStats);

  // Cumulative Yield Analysis
  console.log(`%c==================== 📈 CUMULATIVE DEALS YIELD ANALYSIS ====================`, 'color: #0c831f; font-weight: bold; font-size: 15px;');
  const total50 = allProducts.filter(p => p.discountPercent >= 50).length;
  const total30 = allProducts.filter(p => p.discountPercent >= 30).length;
  const totalAny = allProducts.filter(p => p.discountPercent > 0).length;

  let cumCount = 0;
  let cum50 = 0;
  let cum30 = 0;
  let cumAny = 0;

  const cumulativeReport = [];
  for (let i = 0; i < pageStats.length; i++) {
    const pageNum = i + 1;
    const itemsOnPage = allProducts.filter(p => p.page === pageNum);

    cumCount += itemsOnPage.length;
    cum50 += itemsOnPage.filter(p => p.discountPercent >= 50).length;
    cum30 += itemsOnPage.filter(p => p.discountPercent >= 30).length;
    cumAny += itemsOnPage.filter(p => p.discountPercent > 0).length;

    cumulativeReport.push({
      'Stopping At': `Page 1 to ${pageNum}`,
      'Total Products': cumCount,
      'Any Deals Captured': `${cumAny} / ${totalAny} (${totalAny > 0 ? Math.round((cumAny / totalAny) * 100) : 100}%)`,
      'Deals ≥30% Captured': `${cum30} / ${total30} (${total30 > 0 ? Math.round((cum30 / total30) * 100) : 100}%)`,
      'Deals ≥50% Captured': `${cum50} / ${total50} (${total50 > 0 ? Math.round((cum50 / total50) * 100) : 100}%)`
    });
  }
  console.table(cumulativeReport);

  // Top 10 Best Deals Across All Pages
  console.log(`%c==================== 🏆 TOP 10 BEST DEALS (WHERE DID THEY HIDE?) ====================`, 'color: #ea580c; font-weight: bold; font-size: 15px;');
  const sortedDeals = [...allProducts].sort((a, b) => b.discountPercent - a.discountPercent).slice(0, 10);
  console.table(sortedDeals.map(d => ({
    'Found On': `Page ${d.page}`,
    'Discount': `${d.discountPercent}% OFF`,
    'Price': `₹${d.price.toFixed(2)}`,
    'MRP': `₹${d.mrp.toFixed(2)}`,
    'Product Name': d.name,
    'Brand': d.brand
  })));

  // Final Actionable Recommendation
  console.log(`%c==================== 💡 KEY FINDINGS & RECOMMENDATION ====================`, 'color: #7a14ac; font-weight: bold;');
  if (pageStats.length > 0) {
    const p1Any = pageStats[0]['Deals ≥30%'];
    const p1Max = pageStats[0]['Max Disc'];
    console.log(`• Page 1 has top discount of ${p1Max}.`);
    if (pageStats.length >= 3) {
      const p1to3Deals30 = allProducts.filter(p => p.page <= 3 && p.discountPercent >= 30).length;
      const pct30InTop3 = total30 > 0 ? Math.round((p1to3Deals30 / total30) * 100) : 100;
      console.log(`• Fetching just the first 3 pages captures %c${pct30InTop3}% of all ≥30% deals%c!`, 'color: #0c831f; font-weight: bold;', 'color: inherit;');
    }
  }
  console.log(`========================================================================\n`);

  window.__lastZeptoAnalysis = { pageStats, cumulativeReport, sortedDeals, allProducts };
  return window.__lastZeptoAnalysis;
})();
