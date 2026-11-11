/**
 * Zepto Server-Side Price Filter Test Script (v3 - Recursive Layout Extractor)
 * Paste this directly into DevTools Console on zepto.com
 */
(async function testZeptoPriceFilter() {
  // ================= CONFIGURATION =================
  const QUERY = 'Snacks';
  const MAX_PRICE = 51; // Max price in ₹
  const MIN_PRICE = 0;  // Min price in ₹
  const PAGE_NUMBER = 0; // Page 0 is Page 1
  const FALLBACK_STORE_ID = 'c48dd700-4314-4cc1-bffa-e1344e0298dc';
  // =================================================

  console.log(`%c[Zepto Filter Test] Searching for "${QUERY}" with Server Max Price ₹${MAX_PRICE}...`, 'color: #7a14ac; font-weight: bold; font-size: 14px;');

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
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 1. Discover store_id from cookies, localStorage, sessionStorage or fallback
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

    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const val = sessionStorage.getItem(sessionStorage.key(i));
        if (!val) continue;
        const m = val.match(/"store_?id"\s*:\s*"([a-f0-9\-]{36})"/i);
        if (m && m[1]) return m[1];
      }
    } catch (e) {}

    return FALLBACK_STORE_ID;
  }

  function findCsrfSecret() {
    const fromCookie = getCookie('csrfSecret') || getCookie('x-csrf-secret');
    if (fromCookie) return fromCookie;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const val = localStorage.getItem(localStorage.key(i));
        if (!val) continue;
        const m = val.match(/"csrf[_-]?secret"\s*:\s*"([^"]+)"/i);
        if (m && m[1]) return m[1];
      }
    } catch (e) {}
    return '';
  }

  const storeId = findStoreId();
  const csrfSecret = findCsrfSecret();
  const xsrfToken = getCookie('XSRF-TOKEN');
  const sessionId = getCookie('session_id') || generateUUID();
  const deviceId = getCookie('unique_browser_id') || generateUUID();
  const requestId = generateUUID();
  const filterId = generateUUID();
  const urlPath = '/user-search-service/api/v3/search';

  console.log(`[Zepto Filter Test] Using Store ID: %c${storeId}`, 'color: #0c831f; font-weight: bold;');

  // 2. Construct Search request body with rangeFilters & filterId
  const requestBody = {
    query: QUERY,
    pageNumber: PAGE_NUMBER,
    intentId: generateUUID(),
    mode: 'AUTOSUGGEST',
    userSessionId: sessionId,
    filterId: filterId,
    rangeFilters: {
      price: {
        min: MIN_PRICE,
        max: MAX_PRICE
      }
    },
    requestMeta: {
      filterMode: 1
    }
  };

  const bodyStr = JSON.stringify(requestBody);

  // 3. Compute Zepto HMAC-SHA256 signature
  const signParams = {
    body: bodyStr,
    deviceId: deviceId,
    method: 'post',
    requestId: requestId,
    secret: xsrfToken || '',
    url: urlPath
  };
  const paramStr = Object.keys(signParams).sort().reduce((acc, k, idx) => acc + (idx === 0 ? '' : '|') + signParams[k], '');
  const signature = await sha256Hex(paramStr);
  const timezone = await sha256Hex(signature);

  const COMPATIBLE_COMPONENTS = ',NEW_BILL_INFO,RE_PROMISE_ETA_ORDER_SCREEN_ENABLED,SUPERSTORE_V1,MANUALLY_APPLIED_DELIVERY_FEE_RECEIVABLE,MARKETPLACE_REPLACEMENT,ZEPTO_PASS:5,CART_REDESIGN_ENABLED,SHIPMENT_WIDGETIZATION_ENABLED,TABBED_CAROUSEL_V2,24X7_ENABLED_V1,PROMO_CASH:0,HOMEPAGE_V2,SUPER_SAVER:1,NO_PLATFORM_CHECK_ENABLED_V2,HP_V4_FEED,GIFT_CARD,SCLP_ADD_MONEY,GIFTING_ENABLED,OFSE,WIDGET_BASED_ETA,PC_REVAMP_1,NEW_ETA_BANNER,NO_COST_EMI_V1,ITEMISATION_ENABLED,SWAP_AND_SAVE_ON_CART,WIDGET_RESTRUCTURE,PRICING_CAMPAIGN_ID,BACHAT_FOR_ALL,TABBED_CAROUSEL_V3,MULTITAB_V2,VERTICAL_FEED_PRODUCT_GRID,CART_LMS:2,SAMPLING_UPSELL_CAMPAIGN,DISCOUNTED_ADDONS_ENABLED,UPSELL_COUPON_SS:0,SIZE_EXCHANGE_ENABLED,ENABLE_FLOATING_CART_BUTTON,SAMPLING_V3,HYBRID_CAMPAIGN,';

  const headers = {
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
    'request-signature': signature,
    'x-timezone': timezone,
    'request_id': requestId,
    'requestid': requestId,
    'x-without-bearer': 'true'
  };

  if (xsrfToken) headers['x-xsrf-token'] = xsrfToken;
  if (csrfSecret) headers['x-csrf-secret'] = csrfSecret;

  console.log('[Zepto Filter Test] Sending signed request to BFF...', requestBody);

  const startTime = performance.now();
  const response = await fetch('https://bff-gateway.zepto.com' + urlPath, {
    method: 'POST',
    headers: headers,
    credentials: 'include',
    mode: 'cors',
    body: bodyStr
  });

  const duration = Math.round(performance.now() - startTime);

  if (!response.ok) {
    console.error(`%c[Zepto Filter Test] HTTP Error ${response.status}: ${response.statusText}`, 'color: #ef4444; font-weight: bold; font-size: 14px;');
    const rawError = await response.text();
    console.log('%c--- Exact Error Response from Zepto Server ---', 'color: #ef4444; font-weight: bold;');
    try {
      console.dir(JSON.parse(rawError));
    } catch (e) {
      console.log(rawError);
    }
    console.log('%c---------------------------------------------', 'color: #ef4444;');
    return;
  }

  const data = await response.json();
  console.log(`%c[Zepto Filter Test] Success! Received response in ${duration}ms`, 'color: #0c831f; font-weight: bold; font-size: 14px;');
  window.lastSearchResult = data;

  // 4. Robust Recursive Product Extraction across all Zepto Widget Layouts
  const layout = Array.isArray(data.layout) ? data.layout :
                 (data.pageLayout && Array.isArray(data.pageLayout.widgets) ? data.pageLayout.widgets :
                 (data.widgets || []));

  const parsedProducts = [];
  const seenIds = new Set();

  for (const w of layout) {
    if (!w) continue;
    const wName = w.widgetName || '';
    const wId = w.widgetId || '';

    // Ignore cross-sell / recommendation carousels that inject unrelated items
    if (wName.includes('CROSS_SELL') || wId.includes('CROSS_SELL')) {
      continue;
    }
    // Ignore pure layout title or filter headers
    if (wId === 'TITLE_WIDGET' || wId === 'TOP_FILTERS_WIDGET') {
      continue;
    }

    const resolver = (w.data && w.data.resolver) || {};
    const rData = resolver.data || {};
    const items = rData.items || (w.data && w.data.items) || [];

    for (const item of items) {
      if (!item) continue;

      // Type A: Standard Search Product (item.productResponse)
      if (item.productResponse) {
        addParsedProduct(item.productResponse, wName);
      }
      // Type B: Contextual / Sponsored Ad Cards (item.items -> subitem.data)
      else if (Array.isArray(item.items)) {
        for (const sub of item.items) {
          if (sub && sub.type === 'MEDIA_ITEM') continue; // Skip banner/video ad items
          if (sub && sub.data && (sub.data.product || sub.data.sellingPrice || sub.data.productVariant)) {
            addParsedProduct(sub.data, wName);
          }
        }
      }
      // Type C: Direct Product Item
      else if (item.product || item.productVariant || item.sellingPrice) {
        addParsedProduct(item.data || item, wName);
      }
    }
  }

  function addParsedProduct(p, sourceWidget) {
    if (!p) return;
    const prod = p.product || (p.productResponse && p.productResponse.product) || p;
    const variant = p.productVariant || (p.productResponse && p.productResponse.productVariant) || p;

    const mrp = (p.mrp || (variant && variant.mrp) || 0) / 100;
    const price = (p.discountedSellingPrice || p.sellingPrice || (variant && variant.discountedSellingPrice) || (variant && variant.sellingPrice) || mrp || 0) / 100;

    // Strict validation: Reject non-products, banner headlines, media items
    if (price <= 0 || mrp <= 0) return;

    const id = (variant && variant.id) || (prod && prod.id) || p.id;
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);

    const name = (prod && prod.name) || (p && p.name) || '';
    if (!name || !name.trim()) return;
    const brand = (prod && prod.brand) || '';
    const isOOS = Boolean(p.outOfStock || (variant && variant.outOfStock) || p.isOutOfStock);

    parsedProducts.push({
      Name: name.length > 35 ? name.substring(0, 32) + '...' : name,
      Brand: brand,
      'Selling Price': `₹${price.toFixed(2)}`,
      'MRP': `₹${mrp.toFixed(2)}`,
      'Discount': mrp > price ? `${Math.round(((mrp - price) / mrp) * 100)}%` : '0%',
      'Price Number': price,
      'In Stock': !isOOS,
      'Widget': sourceWidget
    });
  }

  // 5. Statistics & Filtering Verification
  const underLimit = parsedProducts.filter(p => p['Price Number'] <= MAX_PRICE);
  const overLimit = parsedProducts.filter(p => p['Price Number'] > MAX_PRICE);
  const totalCount = data.totalProductCount || parsedProducts.length;
  const isEndOfPage = Boolean(data.hasReachedEnd || data.endOfPage || (data.data && data.data.endOfPage));

  console.log(`\n%c================ RESULTS SUMMARY ================`, 'color: #7a14ac; font-weight: bold;');
  console.log(`Total Products on Page 1: ${parsedProducts.length}`);
  console.log(`%cProducts <= ₹${MAX_PRICE}: ${underLimit.length} (${Math.round((underLimit.length / (parsedProducts.length || 1)) * 100)}%)`, 'color: #0c831f; font-weight: bold;');
  console.log(`Products > ₹${MAX_PRICE}: ${overLimit.length} (sponsored/booster ads)`);
  console.log(`Server-Reported Total Products: ${totalCount}`);
  console.log(`End Of Page Reached? ${isEndOfPage ? 'YES' : 'NO'}`);
  console.log(`=================================================\n`);

  if (underLimit.length > 0) {
    console.log(`%c--- Products Under ₹${MAX_PRICE} (Page 1) ---`, 'color: #0c831f; font-weight: bold;');
    console.table(underLimit.map(({ 'Price Number': _, Widget: __, ...rest }) => rest));
  }

  if (overLimit.length > 0) {
    console.log(`%c--- Sponsored / Booster Items Over ₹${MAX_PRICE} (Discarded) ---`, 'color: #64748b; font-weight: bold;');
    console.table(overLimit.map(({ 'Price Number': _, ...rest }) => rest));
  }

  return { total: parsedProducts.length, underLimit: underLimit.length, overLimit: overLimit.length, isEndOfPage };
})();
