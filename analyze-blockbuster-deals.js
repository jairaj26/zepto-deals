/**
 * Zepto Blockbuster Deals Analyzer & Subcategory Explorer
 * -------------------------------------------------------
 * Run this in the DevTools console on https://www.zepto.com
 * 
 * 1. Discovers ALL available categories/tabs under Blockbuster Deals.
 * 2. Scans Blockbuster Deals page-by-page to analyze whether deep pagination is needed
 *    or if the highest discounts are concentrated on Page 1 & 2.
 */
(async function analyzeBlockbusterDeals() {
  // ==================== CONFIGURATION ====================
  // Choose which subcategory to analyze:
  // 'Top Picks', 'Bath & Body', 'Fragrances', 'Tea, Coffee & More', 'Skincare',
  // 'Breakfast & Sauces', 'Protein & Nutrition', 'Dairy, Bread & Eggs',
  // 'Biscuits', 'Cleaning Essentials', 'Masala, Dry Fruits & More'
  // Or 'Top Picks' for the main flagship deals feed.
  const TARGET_SUBCATEGORY_NAME = 'Top Picks';
  const MAX_PAGES = 10;
  const DELAY_MS = 600;
  const FALLBACK_STORE_ID = 'c48dd700-4314-4cc1-bffa-e1344e0298dc';
  const DEFAULT_LATITUDE = 12.9716;
  const DEFAULT_LONGITUDE = 77.5946;
  // =======================================================

  console.log(`%c[Zepto Blockbuster Analyzer] Starting analysis...`, 'color: #7a14ac; font-weight: bold; font-size: 15px;');

  const BLOCKBUSTER_CATEGORY = {
    name: 'Blockbuster Deals',
    categoryId: '19c50c75-5341-4617-8519-686ecb46bba6',
    subCategoryId: 'f09d83f6-d14b-4402-a12a-a01c7c8738d0'
  };

  const PRE_SEEDED_SUBCATEGORIES = [
    { title: 'Top Picks', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: 'f09d83f6-d14b-4402-a12a-a01c7c8738d0' },
    { title: 'Bath & Body', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: '7441e990-4677-4c6d-82f8-3e82742575c8' },
    { title: 'Fragrances', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: '60d9be7b-d961-471f-a6ce-17f1d4e127c0' },
    { title: 'Tea, Coffee & More', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: '95a554df-77a5-40b7-b7ba-1a564f4426e9' },
    { title: 'Skincare', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: '3d9d232a-5ac2-4397-bd88-4083027fea9b' },
    { title: 'Protein & Nutrition', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: 'b8c3314a-3285-4cab-a06a-14dbe7b987fd' },
    { title: 'Dairy, Bread & Eggs', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: 'a7b876e1-deec-457e-ba19-0b1902c9f2ce' },
    { title: 'Biscuits', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: '0333efaf-3c19-4683-a022-0439c827013e' },
    { title: 'Cleaning Essentials', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: 'bf07d520-c29c-4033-9bf6-2cd35656a63b' },
    { title: 'Masala, Dry Fruits & More', categoryId: '19c50c75-5341-4617-8519-686ecb46bba6', subCategoryId: 'c06f9bcd-fade-465b-a0b9-ec06e367a948' }
  ];

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

  function findLocation() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const val = localStorage.getItem(localStorage.key(i));
        if (!val) continue;
        try {
          const parsed = JSON.parse(val);
          if (parsed && typeof parsed === 'object') {
            const lat = parsed.latitude || parsed.lat || (parsed.coords && parsed.coords.latitude) || (parsed.location && parsed.location.latitude);
            const lon = parsed.longitude || parsed.lon || parsed.lng || (parsed.coords && parsed.coords.longitude) || (parsed.location && parsed.location.longitude);
            if (lat && lon && !isNaN(Number(lat)) && !isNaN(Number(lon))) {
              return { latitude: Number(lat), longitude: Number(lon) };
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
    return { latitude: DEFAULT_LATITUDE, longitude: DEFAULT_LONGITUDE };
  }

  const storeId = findStoreId();
  const location = findLocation();
  const xsrfToken = getCookie('XSRF-TOKEN');
  const sessionId = getCookie('session_id') || generateUUID();
  const deviceId = getCookie('unique_browser_id') || generateUUID();
  const COMPATIBLE_COMPONENTS = ',NEW_BILL_INFO,SUPERSTORE_V1,ZEPTO_PASS:5,SUPER_SAVER:1,';
  const urlPath = '/lms/api/v2/get_page';

  console.log(`[Zepto Blockbuster Analyzer] Store ID: %c${storeId}`, 'color: #0c831f; font-weight: bold;');
  console.log(`[Zepto Blockbuster Analyzer] Location: Lat ${location.latitude}, Lon ${location.longitude}`);

  async function fetchSignedBff(bodyObj) {
    const bodyStr = JSON.stringify(bodyObj);
    const reqId = generateUUID();
    const signParams = { body: bodyStr, deviceId, method: 'post', requestId: reqId, secret: xsrfToken || '', url: urlPath };
    const paramStr = Object.keys(signParams).sort().reduce((acc, k, idx) => acc + (idx === 0 ? '' : '|') + signParams[k], '');
    const signature = await sha256Hex(paramStr);
    const timezone = await sha256Hex(signature);

    const res = await fetch('https://bff-gateway.zepto.com' + urlPath, {
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
        'request_id': reqId,
        'requestid': reqId,
        'x-without-bearer': 'true'
      },
      credentials: 'include',
      body: bodyStr
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ================== STEP 1: DISCOVER ALL BLOCKBUSTER CATEGORIES ==================
  console.log(`\n%c==================== 🔍 STEP 1: DISCOVERING BLOCKBUSTER CATEGORIES ====================`, 'color: #7a14ac; font-weight: bold; font-size: 14px;');
  
  let discoveredSubcats = [];

  // Method A: Probe via HTML next_data
  try {
    const pageHtmlRes = await fetch(`/cn/blockbuster-deals/top-picks/cid/${BLOCKBUSTER_CATEGORY.categoryId}/scid/${BLOCKBUSTER_CATEGORY.subCategoryId}`, { credentials: 'include' });
    if (pageHtmlRes.ok) {
      const htmlText = await pageHtmlRes.text();
      // Extract subcategory tabs from page JSON
      const tabMatches = htmlText.match(/\{"activeIcon"[^}]*?"title":"([^"]+)"[^}]*?"category_id":"([^"]+)"[^}]*?"subcategory_id":"([^"]+)"[^}]*\}/g);
      if (tabMatches && tabMatches.length > 0) {
        tabMatches.forEach(tStr => {
          try {
            const parsed = JSON.parse(tStr);
            if (parsed.title && parsed.params?.subcategory_id) {
              discoveredSubcats.push({
                title: parsed.title,
                categoryId: parsed.params.category_id || BLOCKBUSTER_CATEGORY.categoryId,
                subCategoryId: parsed.params.subcategory_id,
                source: 'Live Web Page'
              });
            }
          } catch (e) {}
        });
      }
    }
  } catch (err) {
    console.warn('HTML scrape attempt skipped:', err);
  }

  // Method B: Probe via BFF with disable_tabs = false
  try {
    const probeBody = {
      page_type: 'SUBCATEGORY',
      version: 'v2',
      latitude: location.latitude,
      longitude: location.longitude,
      category_id: BLOCKBUSTER_CATEGORY.categoryId,
      subcategory_id: BLOCKBUSTER_CATEGORY.subCategoryId,
      page_size: 20,
      page_identifier: 'browse_category_product',
      filter_id: '0',
      subcategory_intent_id: '0',
      ads_end_range: 0,
      ads_start_range: 0,
      atlas_offset: 0,
      disable_tabs: false,
      eta_raining: false,
      infinite_feed_widget_id: 0,
      is_continuous_feed: true,
      last_widget_id: 0,
      oos_end_range: 0,
      oos_start_range: 0,
      page_number: 1
    };
    const bffProbe = await fetchSignedBff(probeBody);
    const widgets = (bffProbe.pageLayout && bffProbe.pageLayout.widgets) || [];
    for (const w of widgets) {
      if (!w) continue;
      const wId = String(w.widgetId || '');
      const wName = String(w.widgetName || '');
      if (wId.includes('TAB') || wName.includes('TAB')) {
        const tabs = w.data?.tabs || (w.data?.resolver?.data?.tabs) || [];
        for (const t of tabs) {
          const title = t.title || t.name;
          const scid = t.subcategory_id || t.params?.subcategory_id || t.id;
          if (title && scid && !discoveredSubcats.some(s => s.subCategoryId === scid)) {
            discoveredSubcats.push({
              title,
              categoryId: BLOCKBUSTER_CATEGORY.categoryId,
              subCategoryId: scid,
              source: 'BFF Tab Widget'
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('BFF probe skipped:', err);
  }

  // Merge with pre-seeded subcategories
  for (const seed of PRE_SEEDED_SUBCATEGORIES) {
    if (!discoveredSubcats.some(s => s.subCategoryId === seed.subCategoryId || s.title.toLowerCase() === seed.title.toLowerCase())) {
      discoveredSubcats.push({ ...seed, source: 'Pre-seeded List' });
    }
  }

  console.table(discoveredSubcats.map((s, idx) => ({
    '#': idx + 1,
    'Subcategory Name': s.title,
    'Category ID': s.categoryId,
    'Subcategory ID': s.subCategoryId,
    'Source': s.source
  })));

  // Identify target subcategory for discount analysis
  let targetSubcat = discoveredSubcats.find(s => s.title.toLowerCase() === TARGET_SUBCATEGORY_NAME.toLowerCase()) || discoveredSubcats[0];
  console.log(`\n%c==================== 📊 STEP 2: ANALYZING "${targetSubcat.title.toUpperCase()}" PAGE-BY-PAGE ====================`, 'color: #7a14ac; font-weight: bold; font-size: 14px;');

  // ================== STEP 2: PAGE-BY-PAGE SCAN ==================
  const pageStats = [];
  const allProducts = [];
  const globalSeenIds = new Set();

  let body = {
    page_type: 'SUBCATEGORY',
    version: 'v2',
    latitude: location.latitude,
    longitude: location.longitude,
    category_id: targetSubcat.categoryId,
    subcategory_id: targetSubcat.subCategoryId,
    page_size: 20,
    page_identifier: 'browse_category_product',
    filter_id: '0',
    subcategory_intent_id: '0',
    ads_end_range: 0,
    ads_start_range: 0,
    atlas_offset: 0,
    disable_tabs: true,
    eta_raining: false,
    infinite_feed_widget_id: 0,
    is_continuous_feed: true,
    last_widget_id: 0,
    oos_end_range: 0,
    oos_start_range: 0,
    page_number: 1
  };

  let pageNum = 1;
  while (pageNum <= MAX_PAGES) {
    console.log(`%cFetching Page ${pageNum}...`, 'color: #3b82f6;');
    if (pageNum > 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    let data;
    try {
      data = await fetchSignedBff(body);
    } catch (err) {
      console.error(`Error on page ${pageNum}:`, err);
      break;
    }

    const widgets = (data.pageLayout && data.pageLayout.widgets) || [];
    const pageProducts = [];
    const pageSeen = new Set();

    function addProduct(p, widgetName) {
      if (!p) return;
      const prod = p.product || (p.productResponse && p.productResponse.product) || (p.item && p.item.product) || p;
      const variant = p.productVariant || (p.productResponse && p.productResponse.productVariant) || (p.item && p.item.productVariant) || p;

      const mrp = (p.mrp || (variant && variant.mrp) || 0) / 100;
      const price = (p.discountedSellingPrice || p.sellingPrice || (variant && variant.discountedSellingPrice) || (variant && variant.sellingPrice) || mrp || 0) / 100;

      // Strict validation: Reject non-products, zero prices, media banners
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

      const record = {
        page: pageNum,
        id,
        name,
        brand,
        price,
        mrp,
        discountPercent,
        isNewGlobal,
        widget: widgetName
      };

      pageProducts.push(record);
      allProducts.push(record);
    }

    // Traverse layout widgets
    function traverse(list) {
      if (!Array.isArray(list)) return;
      for (const w of list) {
        if (!w) continue;
        const wName = String(w.widgetName || '');
        const wId = String(w.widgetId || '');

        if (wName.includes('CROSS_SELL') || wId.includes('CROSS_SELL')) continue;
        if (wId === 'TITLE_WIDGET' || wId === 'TOP_FILTERS_WIDGET') continue;

        const resolverItems = (w.data && w.data.resolver && w.data.resolver.data && Array.isArray(w.data.resolver.data.items))
          ? w.data.resolver.data.items : [];
        const directItems = (w.data && Array.isArray(w.data.items)) ? w.data.items :
                            (w.data && Array.isArray(w.data.products) ? w.data.products :
                            (Array.isArray(w.items) ? w.items :
                            (Array.isArray(w.products) ? w.products : [])));

        for (const item of [...resolverItems, ...directItems]) {
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

        if (Array.isArray(w.widgets)) traverse(w.widgets);
        if (w.data && Array.isArray(w.data.widgets)) traverse(w.data.widgets);
      }
    }

    traverse(widgets);

    if (pageProducts.length === 0) {
      console.log(`Page ${pageNum} returned 0 products. End of list.`);
      break;
    }

    const discounts = pageProducts.map(p => p.discountPercent);
    const discountedOnly = discounts.filter(d => d > 0);
    const maxDiscount = discounts.length > 0 ? Math.max(...discounts) : 0;
    const avgDiscountAll = discounts.length > 0 ? Math.round(discounts.reduce((a, b) => a + b, 0) / discounts.length) : 0;
    const avgDiscountActive = discountedOnly.length > 0 ? Math.round(discountedOnly.reduce((a, b) => a + b, 0) / discountedOnly.length) : 0;

    const deals50 = pageProducts.filter(p => p.discountPercent >= 50).length;
    const deals30 = pageProducts.filter(p => p.discountPercent >= 30).length;
    const deals15 = pageProducts.filter(p => p.discountPercent >= 15).length;
    const noDiscount = pageProducts.filter(p => p.discountPercent === 0).length;
    const topDeal = pageProducts.reduce((best, cur) => cur.discountPercent > (best?.discountPercent || 0) ? cur : best, null);

    pageStats.push({
      'Page #': pageNum,
      'Total Items': pageProducts.length,
      'Discounted (%)': `${Math.round((discountedOnly.length / pageProducts.length) * 100)}%`,
      'Max Disc': `${maxDiscount}%`,
      'Avg Disc (All)': `${avgDiscountAll}%`,
      'Avg Disc (Deals)': `${avgDiscountActive}%`,
      'Deals ≥50%': deals50,
      'Deals ≥30%': deals30,
      'Deals ≥15%': deals15,
      '0% Disc': noDiscount,
      'Best Deal on Page': topDeal ? `${topDeal.name.slice(0, 32)}... (${topDeal.discountPercent}% off)` : 'None'
    });

    const endOfPage = Boolean(data.pageLayout && data.pageLayout.endOfPage);
    const nextParams = data.pageLayout && data.pageLayout.nextPageParams;
    if (endOfPage || !nextParams) {
      console.log(`Server reached endOfPage at Page ${pageNum}.`);
      break;
    }

    body = Object.assign({}, body, nextParams);
    pageNum++;
  }

  // ================== STEP 3: REPORTING & ANALYSIS ==================
  console.log(`\n%c==================== 📊 PAGE-BY-PAGE DISCOUNT BREAKDOWN ====================`, 'color: #7a14ac; font-weight: bold; font-size: 15px;');
  console.log(`Category: Blockbuster Deals > "${targetSubcat.title}" | Unique Products: ${globalSeenIds.size}`);
  console.table(pageStats);

  // Cumulative Yield Analysis
  console.log(`%c==================== 📈 CUMULATIVE DEALS YIELD ANALYSIS ====================`, 'color: #0c831f; font-weight: bold; font-size: 15px;');
  const total50 = allProducts.filter(p => p.discountPercent >= 50).length;
  const total30 = allProducts.filter(p => p.discountPercent >= 30).length;
  const totalAny = allProducts.filter(p => p.discountPercent > 0).length;

  let cumCount = 0, cum50 = 0, cum30 = 0, cumAny = 0;
  const cumulativeReport = [];
  for (let i = 0; i < pageStats.length; i++) {
    const pageIndex = i + 1;
    const itemsOnPage = allProducts.filter(p => p.page === pageIndex);

    cumCount += itemsOnPage.length;
    cum50 += itemsOnPage.filter(p => p.discountPercent >= 50).length;
    cum30 += itemsOnPage.filter(p => p.discountPercent >= 30).length;
    cumAny += itemsOnPage.filter(p => p.discountPercent > 0).length;

    cumulativeReport.push({
      'Stopping At': `Page 1 to ${pageIndex}`,
      'Total Products': cumCount,
      'Any Deals Captured': `${cumAny} / ${totalAny} (${totalAny > 0 ? Math.round((cumAny / totalAny) * 100) : 100}%)`,
      'Deals ≥30% Captured': `${cum30} / ${total30} (${total30 > 0 ? Math.round((cum30 / total30) * 100) : 100}%)`,
      'Deals ≥50% Captured': `${cum50} / ${total50} (${total50 > 0 ? Math.round((cum50 / total50) * 100) : 100}%)`
    });
  }
  console.table(cumulativeReport);

  // Top 10 Best Deals
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

  window.__lastBlockbusterAnalysis = {
    subcategories: discoveredSubcats,
    pageStats,
    cumulativeReport,
    sortedDeals,
    allProducts
  };

  return window.__lastBlockbusterAnalysis;
})();
