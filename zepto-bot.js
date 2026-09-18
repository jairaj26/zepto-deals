/**
 * Zepto Deals & Discount Alert Bot
 * -------------------------------------------------------------------
 * Runs autonomously via GitHub Actions (hourly schedule) or locally.
 * - Targets: Atta, Oil, Ghee, Dals & Pulses, Rice & More (or custom)
 * - Captures fresh session via Google Chrome with anti-automation WAF handling
 * - Supports optional ZEPTO_SESSION_HEADERS / ZEPTO_COOKIE secret override
 * - Filters items with >= MIN_DISCOUNT_PERCENT (default: 70%)
 * - Mutes items with the same price for 2+ consecutive hours for that day
 * - Sends alerts via Telegram Bot or Discord Webhook
 * - Completely configurable via environment variables / GitHub Secrets
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ===================== CONFIGURATION =====================
// Custom Coordinates (Set via USER_LATITUDE & USER_LONGITUDE secrets or env variables)
const USER_LATITUDE = process.env.USER_LATITUDE ? parseFloat(process.env.USER_LATITUDE) : null;
const USER_LONGITUDE = process.env.USER_LONGITUDE ? parseFloat(process.env.USER_LONGITUDE) : null;

// Generic fallback coordinates (Central Bengaluru) if none provided
const DEFAULT_LATITUDE = 12.9716;
const DEFAULT_LONGITUDE = 77.5946;

// Notification Credentials (Configure via GitHub Secrets)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Minimum Discount Percent (default: 70%)
const MIN_DISCOUNT_PERCENT = process.env.MIN_DISCOUNT_PERCENT ? parseInt(process.env.MIN_DISCOUNT_PERCENT, 10) : 70;
const MAX_PAGES_PER_SUBCAT = parseInt(process.env.MAX_PAGES_PER_SUBCAT, 10) || 15;
const STATE_FILE = path.join(__dirname, 'deals_state.json');

// Optional Pre-configured Session (e.g. from GitHub Secrets)
const ZEPTO_SESSION_HEADERS = process.env.ZEPTO_SESSION_HEADERS;
const ZEPTO_COOKIE = process.env.ZEPTO_COOKIE;

// ===================== TARGET CONFIG =====================
// Target Category: "Atta, Rice, Oil & Dals"
const CATEGORY_ID = process.env.ZEPTO_CATEGORY_ID || '2f7190d0-7c40-458b-b450-9a1006db3d95';
const TARGET_SUBCATS = [
  { name: 'Atta', subCategoryId: '15644eea-d781-4cdd-8d85-e63bd9706b96' },
  { name: 'Oil', subCategoryId: '2b5e863c-9497-46ae-a7e9-85f6ef7380da' },
  { name: 'Ghee', subCategoryId: '56c015a7-b283-4e7a-b3ba-0f76f4f181dc' },
  { name: 'Dals & Pulses', subCategoryId: '59c951bd-4cb4-4659-9467-1e72a8f972d9' },
  { name: 'Rice & More', subCategoryId: '9798b797-0db0-4b04-b198-31b0a5849318' }
];

// ===================== SESSION CAPTURE =====================
async function captureSession() {
  const targetLat = USER_LATITUDE || DEFAULT_LATITUDE;
  const targetLon = USER_LONGITUDE || DEFAULT_LONGITUDE;

  // 1. Check if user provided pre-configured session headers / cookies via Secrets
  if (ZEPTO_SESSION_HEADERS) {
    try {
      const parsed = typeof ZEPTO_SESSION_HEADERS === 'string' ? JSON.parse(ZEPTO_SESSION_HEADERS) : ZEPTO_SESSION_HEADERS;
      console.log('✔ Using pre-configured ZEPTO_SESSION_HEADERS from environment/secrets.');
      return { headers: parsed, location: { latitude: targetLat, longitude: targetLon } };
    } catch (e) {
      console.warn('Notice: Could not parse ZEPTO_SESSION_HEADERS as JSON. Proceeding with browser session capture...');
    }
  }

  console.log(`[1/4] Launching browser to capture fresh Zepto session & solve AWS WAF...`);
  console.log(`      Location: Lat ${targetLat}, Lon ${targetLon} ${USER_LATITUDE ? '(from USER_LATITUDE/LONGITUDE)' : '(default fallback)'}`);

  const launchArgs = [
    '--headless=new',
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
  ];

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      args: launchArgs
    });
  } catch (e) {
    console.log('System Google Chrome not found, falling back to bundled Chromium...');
    browser = await chromium.launch({
      args: launchArgs
    });
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    geolocation: { latitude: targetLat, longitude: targetLon },
    permissions: ['geolocation']
  });

  const page = await context.newPage();

  let capturedHeaders = null;
  let capturedLocation = null;

  // Intercept network requests destined for the BFF Gateway
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('bff-gateway.zepto.com/lms/api/v2/get_page')) {
      const headers = req.headers();
      if (headers['request-signature'] || headers['x-csrf-secret']) {
        if (!capturedHeaders) {
          capturedHeaders = Object.assign({}, headers);
          try {
            const postData = req.postDataJSON();
            if (postData && postData.latitude && postData.longitude) {
              capturedLocation = { latitude: postData.latitude, longitude: postData.longitude };
            }
          } catch (e) {}
        }
      }
    }
  });

  try {
    // Step A: Load home page and wait for AWS WAF silent challenge to solve and reload
    console.log('  -> Navigating to zepto.com...');
    await page.goto('https://www.zepto.com', { waitUntil: 'domcontentloaded', timeout: 35000 });

    for (let i = 1; i <= 20; i++) {
      await page.waitForTimeout(1000);
      const title = await page.title();
      if (title && title.toLowerCase().includes('zepto') && !title.startsWith('Loading')) {
        console.log(`  ✔ Real Zepto page active after ${i}s (Title: "${title}")`);
        break;
      }
    }

    // Step B: Navigate to first target subcategory page to naturally trigger signed BFF queries
    const sampleSubcat = TARGET_SUBCATS[0];
    const categoryUrl = `https://www.zepto.com/cn/atta-rice-oil-dals/atta/cid/${CATEGORY_ID}/scid/${sampleSubcat.subCategoryId}`;
    console.log(`  -> Navigating to category page (${sampleSubcat.name})...`);
    
    await page.goto(categoryUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});

    // Wait up to 8 seconds for header capture
    for (let i = 0; i < 20; i++) {
      if (capturedHeaders) break;
      await page.waitForTimeout(400);
    }

    // Step C: Extract cookies from browser context (including aws-waf-token)
    if (capturedHeaders) {
      const cookies = await context.cookies();
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      if (cookieString) {
        capturedHeaders['cookie'] = cookieString;
      }
      if (ZEPTO_COOKIE) {
        capturedHeaders['cookie'] = (capturedHeaders['cookie'] ? capturedHeaders['cookie'] + '; ' : '') + ZEPTO_COOKIE;
      }
    }
  } catch (err) {
    console.warn('Navigation notice:', err.message);
  } finally {
    await browser.close();
  }

  if (!capturedHeaders) {
    throw new Error(
      'Failed to intercept signed BFF headers from Zepto.\n' +
      'AWS WAF or bot detection blocked the automated browser.\n' +
      'Tip: You can export your session from the browser bookmarklet and set ZEPTO_SESSION_HEADERS in GitHub Secrets to run without browser automation!'
    );
  }

  console.log('✔ Session and signed BFF headers captured successfully.');
  return { 
    headers: capturedHeaders, 
    location: capturedLocation || { latitude: targetLat, longitude: targetLon } 
  };
}

// ===================== DATA FETCHER =====================
async function fetchBffPage(body, sessionHeaders) {
  const reqHeaders = Object.assign({}, sessionHeaders, { 'content-type': 'application/json' });
  const res = await fetch('https://bff-gateway.zepto.com/lms/api/v2/get_page', {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`BFF HTTP ${res.status}`);
  return res.json();
}

function extractDealsFromWidgets(widgets, subcatName) {
  const deals = [];
  function traverse(list) {
    if (!Array.isArray(list)) return;
    for (const w of list) {
      if (!w) continue;
      const items = (w.data && Array.isArray(w.data.items)) ? w.data.items : (w.data && Array.isArray(w.data.products) ? w.data.products : []);
      for (const p of items) {
        if (!p || !p.product) continue;
        const mrp = (p.mrp || 0) / 100;
        const price = (p.discountedSellingPrice || p.sellingPrice || p.mrp || 0) / 100;
        let discount = p.discountPercent;
        if (discount === undefined && mrp > price && mrp > 0) {
          discount = Math.round(((mrp - price) / mrp) * 100);
        }

        // Only keep deals meeting or exceeding the minimum discount threshold
        if (discount >= MIN_DISCOUNT_PERCENT) {
          const pvid = (p.productVariant && p.productVariant.id) || p.id || p.product.id;
          const slug = (p.product && p.product.slug) || (p.product.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const productUrl = pvid ? `https://www.zepto.com/pn/${slug}/pvid/${pvid}` : `https://www.zepto.com/pn/${slug}`;

          let imgPath = (p.productVariant?.images?.[0]?.path) || (p.product?.images?.[0]?.path) || '';
          let imageUrl = '';
          if (imgPath) {
            imageUrl = imgPath.startsWith('http') ? imgPath : `https://cdn.zeptonow.com/production/ik-seo/tr:w-360,f-auto,q-70/${imgPath.replace(/^\//, '')}`;
          }

          deals.push({
            id: pvid,
            name: p.product.name,
            brand: p.product.brand || '',
            packSize: p.productVariant?.formattedPacksize || '',
            mrp,
            price,
            discountPercent: discount,
            subcategory: subcatName,
            url: productUrl,
            imageUrl,
            isOutOfStock: Boolean(
              p.outOfStock || 
              p.productVariant?.outOfStock || 
              p.isOutOfStock ||
              (p.productVariant?.inventory && p.productVariant.inventory.quantity <= 0) ||
              p.availableQuantity === 0
            )
          });
        }
      }
      if (w.widgets) traverse(w.widgets);
      if (w.data?.widgets) traverse(w.data.widgets);
    }
  }
  traverse(widgets);
  return deals;
}

async function scrapeTargetSubcategories(session) {
  const reqLatitude = USER_LATITUDE || session.location?.latitude || DEFAULT_LATITUDE;
  const reqLongitude = USER_LONGITUDE || session.location?.longitude || DEFAULT_LONGITUDE;

  console.log(`[2/4] Scraping target subcategories for >= ${MIN_DISCOUNT_PERCENT}% deals...`);
  console.log(`      Coordinates: Lat ${reqLatitude}, Lon ${reqLongitude}`);
  const allDeals = [];

  for (let i = 0; i < TARGET_SUBCATS.length; i++) {
    const sub = TARGET_SUBCATS[i];
    console.log(`  -> Processing: ${sub.name}...`);

    let body = {
      page_type: 'SUBCATEGORY',
      version: 'v2',
      latitude: reqLatitude,
      longitude: reqLongitude,
      category_id: CATEGORY_ID,
      subcategory_id: sub.subCategoryId,
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

    let page = 1;
    while (page <= MAX_PAGES_PER_SUBCAT) {
      if (page > 1) {
        await new Promise((r) => setTimeout(r, 450 + Math.random() * 400));
      }

      let data;
      try {
        data = await fetchBffPage(body, session.headers);
      } catch (err) {
        console.warn(`    Page ${page} notice: ${err.message}`);
        break;
      }

      const widgets = (data.pageLayout && data.pageLayout.widgets) || [];
      const extracted = extractDealsFromWidgets(widgets, sub.name);
      allDeals.push(...extracted);

      const endOfPage = data.pageLayout?.endOfPage;
      const nextPageParams = data.pageLayout?.nextPageParams;
      if (endOfPage || !nextPageParams) break;

      body = Object.assign({}, body, nextPageParams);
      page++;
    }

    // Inter-subcategory pause
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 500));
  }

  // Deduplicate deals by ID
  const uniqueDeals = Array.from(new Map(allDeals.map((d) => [d.id, d])).values());
  console.log(`✔ Scraped ${TARGET_SUBCATS.length} subcategories. Found ${uniqueDeals.length} items with >= ${MIN_DISCOUNT_PERCENT}% discount.`);
  return uniqueDeals;
}

// ===================== STATE & DEDUPLICATION =====================
function loadState() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // Reset state on a new day
      if (parsed.date !== today) {
        return { date: today, items: {} };
      }
      return parsed;
    }
  } catch (e) {}
  return { date: today, items: {} };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save state:', e.message);
  }
}

/**
 * Evaluates deals against historical state:
 * - If item has same price for 2+ consecutive checks, mute for the rest of today.
 * - If item price dropped further or is new, send alert.
 */
function filterDealsWithState(deals, state) {
  console.log('[3/4] Evaluating deals against 2-hour price suppression rule...');
  const alertsToSend = [];

  deals.forEach((deal) => {
    const existing = state.items[deal.id];

    if (!existing) {
      // 1. Brand new deal
      state.items[deal.id] = {
        name: deal.name,
        lastPrice: deal.price,
        discountPercent: deal.discountPercent,
        consecutiveSamePriceCount: 1,
        mutedForToday: false
      };
      alertsToSend.push(deal);
    } else {
      // 2. Already tracked deal
      if (existing.mutedForToday) {
        // Muted for today, unless the price dropped even lower
        if (deal.price < existing.lastPrice) {
          console.log(`  ⚡ Price dropped further for "${deal.name}" (₹${existing.lastPrice} -> ₹${deal.price})! Unmuting.`);
          existing.lastPrice = deal.price;
          existing.discountPercent = deal.discountPercent;
          existing.consecutiveSamePriceCount = 1;
          existing.mutedForToday = false;
          alertsToSend.push(deal);
        }
      } else if (deal.price === existing.lastPrice) {
        existing.consecutiveSamePriceCount = (existing.consecutiveSamePriceCount || 1) + 1;
        if (existing.consecutiveSamePriceCount >= 2) {
          existing.mutedForToday = true;
          console.log(`  🔇 "${deal.name}" has been at ₹${deal.price} for 2 consecutive runs. Muting for today.`);
        }
      } else {
        // Price changed (e.g. slight fluctuation)
        existing.lastPrice = deal.price;
        existing.discountPercent = deal.discountPercent;
        existing.consecutiveSamePriceCount = 1;
        existing.mutedForToday = false;
        alertsToSend.push(deal);
      }
    }
  });

  return alertsToSend;
}

// ===================== NOTIFICATIONS =====================
async function sendAlerts(deals) {
  console.log(`[4/4] Processing alerts for ${deals.length} deals...`);
  if (deals.length === 0) {
    console.log('No new deals above threshold to alert.');
    return;
  }

  const hasTelegram = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
  const hasDiscord = Boolean(DISCORD_WEBHOOK_URL);

  if (!hasTelegram && !hasDiscord) {
    console.log('\n[Notice] Neither TELEGRAM_BOT_TOKEN nor DISCORD_WEBHOOK_URL is configured.');
    console.log('Printing deals directly to terminal:\n');
    for (const deal of deals) {
      console.log(`  🔥 [${deal.discountPercent}% OFF] ${deal.name}`);
      console.log(`     Price: ₹${deal.price} | MRP: ₹${deal.mrp} | Subcat: ${deal.subcategory}`);
      console.log(`     URL: ${deal.url}\n`);
    }
    return;
  }

  for (const deal of deals) {
    const text = 
`🔥 *ZEPTO ${deal.discountPercent}%+ DEAL ALERT* 🔥
*${escapeMarkdown(deal.name)}*
📦 Pack: ${deal.packSize || 'Standard'}
📂 Subcategory: ${deal.subcategory}

💰 Price: *₹${deal.price.toFixed(2)}* ~₹${deal.mrp.toFixed(2)}~
🏷 Discount: *${deal.discountPercent}% OFF* (Save ₹${(deal.mrp - deal.price).toFixed(2)})
${deal.isOutOfStock ? '⚠️ _Item currently out of stock_' : '✅ _In Stock_'}

🔗 [Open on Zepto](${deal.url})`;

    // Send Telegram Alert
    if (hasTelegram) {
      try {
        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(tgUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: text,
            parse_mode: 'Markdown',
            disable_web_page_preview: false
          })
        });
      } catch (err) {
        console.error('Telegram alert error:', err.message);
      }
    }

    // Send Discord Webhook Alert (Optional)
    if (hasDiscord) {
      try {
        await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content: `**🔥 ZEPTO ${deal.discountPercent}% OFF DEAL!**\n**${deal.name}**\nPrice: **₹${deal.price.toFixed(2)}** (MRP: ~~₹${deal.mrp.toFixed(2)}~~)\nLink: ${deal.url}`
          })
        });
      } catch (err) {
        console.error('Discord alert error:', err.message);
      }
    }

    await new Promise((r) => setTimeout(r, 400));
  }
}

function escapeMarkdown(text) {
  return (text || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// ===================== MAIN EXECUTION =====================
(async function main() {
  try {
    const session = await captureSession();
    const deals = await scrapeTargetSubcategories(session);
    const state = loadState();
    const freshAlerts = filterDealsWithState(deals, state);
    saveState(state);
    await sendAlerts(freshAlerts);
    console.log('✔ Workflow complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Bot run failed:', err);
    process.exit(1);
  }
})();
