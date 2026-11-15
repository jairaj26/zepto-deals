#!/usr/bin/env python3
"""
⚡ Zepto Quick Scan Deal Tracker & Telegram Alert Bot
---------------------------------------------------
- Runs headless Google Chrome via Playwright with a persistent profile.
- Intercepts authentic AWS WAF tokens and session parameters.
- Scans all 11 Quick Scan categories for items <= MAX_PRICE (default: Rs.100).
- Fetches <= 2 pages per category with raw item tracking to prevent early termination.
- Deduplicates deals using `deals_state.json` with hourly mute, daily refresh & 15-day mute rules.
- Sends cleanly formatted deal alerts to Telegram Bot without images.
- Safe logging to zepto_scan.log and stdout (safe for pythonw.exe).
"""

import os
import sys
import json
import time
import asyncio
import argparse
from pathlib import Path
from datetime import datetime

import requests
from playwright.async_api import async_playwright

# ==================== CONFIGURATION & SAFE LOGGING ====================

BASE_DIR = Path(__file__).resolve().parent
LOG_FILE = BASE_DIR / 'zepto_scan.log'

# Reconfigure stdout for UTF-8 on Windows if running in a console
if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def log(msg: str):
    """Safe logger that writes timestamps to zepto_scan.log and prints to stdout if available."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{ts}] {msg}"
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(formatted + '\n')
    except Exception:
        pass

    if sys.stdout is not None:
        try:
            print(msg, flush=True)
        except Exception:
            pass


def load_dotenv():
    """Load key-value pairs from .env, overwriting environment variables so .env takes precedence."""
    env_file = BASE_DIR / '.env'
    if env_file.exists():
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip("'").strip('"')
                    os.environ[key] = val  # Overwrite so .env values take precedence

load_dotenv()

# Scan parameters
MAX_PRICE = float(os.getenv('MAX_PRICE', 100))
PAGES_PER_CATEGORY = int(os.getenv('PAGES_PER_CATEGORY', 2))  # <= 2 pages per category
MIN_DISCOUNT_PERCENT = int(os.getenv('MIN_DISCOUNT_PERCENT', 50))
STORE_LINK_TEXT = os.getenv('STORE_LINK_TEXT', 'Buy on Zepto ⚡️').strip()

# Coordinates (Defaults to Central Bengaluru fallback if unset)
USER_LATITUDE = float(os.getenv('USER_LATITUDE', 12.9716))
USER_LONGITUDE = float(os.getenv('USER_LONGITUDE', 77.5946))

# Telegram Bot Credentials with fallbacks
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
TELEGRAM_CHAT_ID = (
    os.getenv('TELEGRAM_CHAT_ID') or
    os.getenv('TELEGRAM_USER_ID') or
    os.getenv('USER_ID') or
    ''
).strip()

# Quick Scan categories (matching zepto-deals-bookmarklet.js)
QUICK_SCAN_CATEGORIES = [
    'Grocery',
    'Dairy',
    'Masala',
    'Sauces',
    'Packaged Goods',
    'Cleaning',
    'Household',
    'Oral Care',
    'Skincare',
    'Haircare',
    'Body Care'
]

STATE_FILE = BASE_DIR / 'deals_state.json'
LATEST_RESULTS_FILE = BASE_DIR / 'latest_deals.json'


# ==================== STATE MANAGEMENT ====================

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            log(f"[!] Warning reading {STATE_FILE.name}: {e}")
    return {}

def save_state(state: dict):
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
    except Exception as e:
        log(f"[!] Warning saving {STATE_FILE.name}: {e}")


# ==================== TELEGRAM NOTIFIER ====================

def send_telegram_message(text: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        'chat_id': TELEGRAM_CHAT_ID,
        'text': text,
        'parse_mode': 'HTML',
        'disable_web_page_preview': True
    }
    try:
        resp = requests.post(url, json=payload, timeout=15)
        if resp.status_code == 200:
            return True
        elif resp.status_code == 401:
            log(f"[!] Telegram API error 401 Unauthorized: Your TELEGRAM_BOT_TOKEN in .env is invalid or expired. Check @BotFather.")
            return False
        else:
            log(f"[!] Telegram API error {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        log(f"[!] Telegram send failed: {e}")
        return False

def escape_html(text: str) -> str:
    return str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def notify_deals(deals: list, is_test: bool = False) -> bool:
    """Send deals to Telegram without images in the exact requested format. Returns True if all sends succeed."""
    if not deals:
        log("[i] No new deals to notify.")
        return True

    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        log("\n[!] Telegram credentials not configured in .env!")
        log("    Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (or USER_ID) to your .env to receive notifications.")
        log(f"    {len(deals)} deals were saved to latest_deals.json instead.\n")
        return False

    log(f"[>] Sending {len(deals)} deals to Telegram...")

    # Format each deal block without images, exactly as requested:
    # 🛍️ {name}
    # 💰 ₹{price} (MRP: ₹{mrp}) || {discount}% OFF
    # 🔗 <a href="{url}">{STORE_LINK_TEXT}</a>

    blocks = []
    for item in deals:
        name = escape_html(item.get('name', 'Unknown Product'))
        price = item.get('price', 0)
        mrp = item.get('mrp', 0)
        discount = item.get('discount', 0)
        url = item.get('url', '')

        price_str = f"₹{price:.0f}"
        mrp_str = f"₹{mrp:.0f}"
        discount_str = f"{int(discount)}% OFF"

        block_lines = [
            f"🛍️ {name}",
            f"💰 {price_str} (MRP: {mrp_str}) || {discount_str}"
        ]
        if url:
            block_lines.append(f'🔗 <a href="{url}">{STORE_LINK_TEXT}</a>')
        blocks.append("\n".join(block_lines))

    # Pack multiple items into the same message up to Telegram's 4096 character limit
    MAX_MSG_CHARS = 3800
    messages = []
    current_msg = ""

    for block in blocks:
        candidate = (current_msg + "\n\n" + block).strip() if current_msg else block
        if len(candidate) <= MAX_MSG_CHARS:
            current_msg = candidate
        else:
            if current_msg:
                messages.append(current_msg)
            current_msg = block

    if current_msg:
        messages.append(current_msg)

    total_msgs = len(messages)
    all_succeeded = True
    for idx, msg_text in enumerate(messages, start=1):
        success = send_telegram_message(msg_text)
        if success:
            log(f"  ✔ Sent Telegram message {idx}/{total_msgs}")
        else:
            log(f"  ✖ Failed to send Telegram message {idx}/{total_msgs}")
            all_succeeded = False
        time.sleep(1.0)

    return all_succeeded


# ==================== BROWSER DEAL SCANNER ====================

JS_SCANNER_SCRIPT = r"""
async (args) => {
  const { query, maxPages, maxPrice } = args;

  function getCookie(name) {
    try {
      const prefix = name + "=";
      const ca = document.cookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(prefix) === 0) return decodeURIComponent(c.substring(prefix.length));
      }
      return '';
    } catch (e) { return ''; }
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

  const storeId = getCookie('store_id') || 'c48dd700-4314-4cc1-bffa-e1344e0298dc';
  const xsrfToken = getCookie('XSRF-TOKEN') || '';
  const csrfSecret = getCookie('csrfSecret') || '';
  const sessionId = getCookie('session_id') || generateUUID();
  const deviceId = getCookie('unique_browser_id') || generateUUID();
  const urlPath = '/user-search-service/api/v3/search';

  const COMPATIBLE_COMPONENTS = ',NEW_BILL_INFO,RE_PROMISE_ETA_ORDER_SCREEN_ENABLED,SUPERSTORE_V1,MANUALLY_APPLIED_DELIVERY_FEE_RECEIVABLE,MARKETPLACE_REPLACEMENT,ZEPTO_PASS:5,CART_REDESIGN_ENABLED,SHIPMENT_WIDGETIZATION_ENABLED,TABBED_CAROUSEL_V2,24X7_ENABLED_V1,PROMO_CASH:0,HOMEPAGE_V2,SUPER_SAVER:1,NO_PLATFORM_CHECK_ENABLED_V2,HP_V4_FEED,GIFT_CARD,SCLP_ADD_MONEY,GIFTING_ENABLED,OFSE,WIDGET_BASED_ETA,PC_REVAMP_1,NEW_ETA_BANNER,NO_COST_EMI_V1,ITEMISATION_ENABLED,SWAP_AND_SAVE_ON_CART,WIDGET_RESTRUCTURE,PRICING_CAMPAIGN_ID,BACHAT_FOR_ALL,TABBED_CAROUSEL_V3,MULTITAB_V2,VERTICAL_FEED_PRODUCT_GRID,CART_LMS:2,SAMPLING_UPSELL_CAMPAIGN,DISCOUNTED_ADDONS_ENABLED,UPSELL_COUPON_SS:0,SIZE_EXCHANGE_ENABLED,ENABLE_FLOATING_CART_BUTTON,SAMPLING_V3,HYBRID_CAMPAIGN,';

  const products = [];
  const seenIds = new Set();

  function slugify(text) {
    return (text || '').toString().toLowerCase().trim()
      .replace(/[\s\W-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'product';
  }

  function addProduct(p, pageNum) {
    if (!p) return;
    const prod = p.product || (p.productResponse && p.productResponse.product) || p;
    const variant = p.productVariant || (p.productResponse && p.productResponse.productVariant) || p;
    const mrp = (p.mrp || (variant && variant.mrp) || 0) / 100;
    const price = (p.discountedSellingPrice || p.sellingPrice || (variant && variant.discountedSellingPrice) || (variant && variant.sellingPrice) || mrp || 0) / 100;

    // Strict client-side price filter
    if (price <= 0 || mrp <= 0 || price > maxPrice) return;

    const id = (variant && variant.id) || (prod && prod.id) || p.id;
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);

    const name = (prod && prod.name) || (p && p.name) || '';
    if (!name || !name.trim()) return;

    const isOOS = Boolean(
      p.outOfStock || (variant && variant.outOfStock) || p.isOutOfStock ||
      (variant && variant.inventory && variant.inventory.quantity <= 0) ||
      (variant && variant.quantity === 0) || p.availableQuantity === 0
    );

    const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const slug = (prod && prod.slug) || slugify(name);
    const pvid = (variant && variant.id) || '';
    const url = pvid ? ('https://www.zepto.com/pn/' + slug + '/pvid/' + pvid) : ('https://www.zepto.com/pn/' + slug);

    products.push({
      id: id,
      name: name.trim(),
      mrp: mrp,
      price: price,
      discount: discount,
      outOfStock: isOOS,
      url: url,
      page: pageNum
    });
  }

  for (let page = 0; page < maxPages; page++) {
    const requestId = generateUUID();
    const filterId = generateUUID();

    const requestBody = {
      query: query,
      pageNumber: page,
      intentId: generateUUID(),
      mode: 'SHOW_ALL_RESULTS',
      userSessionId: sessionId,
      filterId: filterId,
      rangeFilters: { price: { min: 0, max: maxPrice } },
      requestMeta: { filterMode: 1 }
    };

    const bodyStr = JSON.stringify(requestBody);
    const signParams = {
      body: bodyStr,
      deviceId: deviceId,
      method: 'post',
      requestId: requestId,
      secret: xsrfToken,
      url: urlPath
    };
    const paramStr = Object.keys(signParams).sort().reduce((acc, k, idx) => acc + (idx === 0 ? '' : '|') + signParams[k], '');
    const signature = await sha256Hex(paramStr);
    const timezone = await sha256Hex(signature);

    const headers = {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'app_sub_platform': 'WEB',
      'app_version': '18.1.1',
      'appversion': '18.1.1',
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

    let json;
    try {
      const res = await fetch('https://bff-gateway.zepto.com' + urlPath, {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: bodyStr
      });
      if (!res.ok) break;
      json = await res.json();
    } catch (e) {
      break;
    }

    if (!json) break;

    // Track total valid product objects seen on this page (regardless of price limit)
    let rawItemsSeenOnPage = 0;

    const layout = Array.isArray(json.layout) ? json.layout :
                   (json.pageLayout && Array.isArray(json.pageLayout.widgets) ? json.pageLayout.widgets :
                   (json.widgets || []));

    for (const w of layout) {
      if (!w) continue;
      const wName = w.widgetName || '';
      const wId = w.widgetId || '';
      if (wName.includes('CROSS_SELL') || wId.includes('CROSS_SELL')) continue;
      if (wId === 'TITLE_WIDGET' || wId === 'TOP_FILTERS_WIDGET') continue;

      const resolver = (w.data && w.data.resolver) || {};
      const rData = resolver.data || {};
      const items = rData.items || (w.data && w.data.items) || [];

      for (const item of items) {
        if (!item) continue;
        if (item.productResponse) {
          rawItemsSeenOnPage++;
          addProduct(item.productResponse, page + 1);
        } else if (Array.isArray(item.items)) {
          for (const sub of item.items) {
            if (sub && sub.type !== 'MEDIA_ITEM' && sub.data) {
              rawItemsSeenOnPage++;
              addProduct(sub.data, page + 1);
            }
          }
        } else if (item.product || item.productVariant || item.sellingPrice) {
          rawItemsSeenOnPage++;
          addProduct(item.data || item, page + 1);
        }
      }
    }

    const directItems = (json.data && Array.isArray(json.data.items)) ? json.data.items :
                        (Array.isArray(json.items) ? json.items : []);
    for (const dItem of directItems) {
      rawItemsSeenOnPage++;
      addProduct(dItem.productResponse || dItem, page + 1);
    }

    // Only terminate pagination if server reported endOfPage or absolutely zero raw items returned
    if (json.hasReachedEnd || rawItemsSeenOnPage === 0) {
      break;
    }

    await new Promise(r => setTimeout(r, 650 + Math.random() * 350));
  }

  return products;
}
"""


async def scan_quick_deals(categories: list = None, max_pages: int = None, max_price: float = None) -> list:
    categories = categories or QUICK_SCAN_CATEGORIES
    max_pages = max_pages or PAGES_PER_CATEGORY
    max_price = max_price or MAX_PRICE

    log(f"\n==================================================")
    log(f"🚀 Launching Headless Chrome for Zepto Quick Scan")
    log(f"   Max Price: ₹{max_price:.0f} | Pages: {max_pages} per category")
    log(f"   Categories ({len(categories)}): {', '.join(categories)}")
    log(f"==================================================")

    all_found = []
    seen_keys = set()
    profile_dir = BASE_DIR / 'chrome_profile'

    async with async_playwright() as p:
        # Launch Chrome with persistent profile to maintain AWS WAF tokens and cookies across runs
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            channel='chrome',
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ],
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            viewport={'width': 1366, 'height': 768},
            geolocation={'latitude': USER_LATITUDE, 'longitude': USER_LONGITUDE},
            permissions=['geolocation']
        )

        page = context.pages[0] if context.pages else await context.new_page()

        log("[1/3] Navigating to zepto.com to acquire session & solve AWS WAF...")
        await page.goto('https://www.zepto.com', wait_until='load', timeout=35000)

        # Wait up to 12s polling cookies until XSRF-TOKEN or csrfSecret is present
        cookie_ready = False
        for i in range(12):
            await page.wait_for_timeout(1000)
            try:
                # context.cookies() never fails due to page navigation
                ctx_cookies = await context.cookies()
                ctx_cookie_names = {c['name'] for c in ctx_cookies}
                if 'XSRF-TOKEN' in ctx_cookie_names or 'csrfSecret' in ctx_cookie_names:
                    cookie_ready = True
                    log(f"  ✔ Zepto session cookies ready (verified via context after {i + 1}s).")
                    break

                # Also try document.cookie safely
                cookies_str = await page.evaluate("() => document.cookie || ''")
                if 'XSRF-TOKEN' in cookies_str or 'csrfSecret' in cookies_str:
                    cookie_ready = True
                    log(f"  ✔ Zepto session cookies ready (verified via DOM after {i + 1}s).")
                    break
            except Exception:
                # Catch navigation or execution context destroyed errors during AWS WAF reload / Next.js navigation
                continue

        if not cookie_ready:
            log("  ⚠ Note: Session cookies not detected after 12s; continuing with fallback headers.")

        log(f"\n[2/3] Scanning {len(categories)} categories ({max_pages} pages each)...")

        for idx, cat in enumerate(categories, start=1):
            log(f"  [{idx:02d}/{len(categories):02d}] Fetching \"{cat}\" (pages 1-{max_pages} ≤ ₹{max_price:.0f})...")

            cat_products = []
            for attempt in range(2):
                try:
                    cat_products = await page.evaluate(JS_SCANNER_SCRIPT, {
                        'query': cat,
                        'maxPages': max_pages,
                        'maxPrice': max_price
                    })
                    break
                except Exception as e:
                    if attempt == 0:
                        log(f"      [!] Retrying \"{cat}\" after navigation settle delay ({e})...")
                        await page.wait_for_timeout(2000)
                    else:
                        log(f"      ✖ Error fetching \"{cat}\": {e}")

            new_count = 0
            for item in cat_products:
                # Filter out out-of-stock items
                if item.get('outOfStock'):
                    continue

                # Allow items if discount >= MIN_DISCOUNT_PERCENT OR flash deal price <= Rs.5
                discount = item.get('discount', 0)
                price = item.get('price', 999)
                if not (discount >= MIN_DISCOUNT_PERCENT or price <= 5):
                    continue

                dedup_key = str(item.get('id') or item.get('url') or item['name'])
                if dedup_key not in seen_keys:
                    seen_keys.add(dedup_key)
                    item['category'] = cat
                    all_found.append(item)
                    new_count += 1

            log(f"      ✔ Found {len(cat_products)} raw items ({new_count} unique deal items in-stock)")

            # Safe delay between categories
            await asyncio.sleep(0.8 + 0.4 * (idx % 2))

        await context.close()

    log(f"\n[3/3] Completed scan: {len(all_found)} total deals collected.")
    return all_found


# ==================== MAIN RUNNER ====================

def run_once(is_test: bool = False):
    start_time = datetime.now()
    log(f"\n[{start_time.strftime('%Y-%m-%d %H:%M:%S')}] Starting Zepto Quick Scan run...")

    categories = QUICK_SCAN_CATEGORIES if not is_test else QUICK_SCAN_CATEGORIES[:2]
    max_pages = PAGES_PER_CATEGORY if not is_test else 2

    deals = asyncio.run(scan_quick_deals(categories=categories, max_pages=max_pages))

    # Sort deals by discount percentage descending, then price ascending
    deals.sort(key=lambda x: (-x.get('discount', 0), x.get('price', 0)))

    # Save complete latest deals file
    with open(LATEST_RESULTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(deals, f, indent=2, ensure_ascii=False)
    log(f"✔ Saved full list of {len(deals)} deals to {LATEST_RESULTS_FILE.name}")

    # Deduplicate against previous state with hourly, daily refresh & 15-day mute rules
    state = load_state()
    today_str = datetime.now().strftime("%Y-%m-%d")
    now_ts = datetime.now().timestamp()
    fresh_deals = []
    pending_state_updates = {}

    for item in deals:
        item_id = str(item.get('id') or item.get('url') or item['name'])
        price = float(item['price'])
        existing = state.get(item_id)
        should_alert = False

        if not existing:
            # 1. Brand new item: alert immediately
            should_alert = True
            pending_state_updates[item_id] = {
                'name': item['name'],
                'price': price,
                'mrp': item['mrp'],
                'discount': item['discount'],
                'category': item.get('category'),
                'url': item.get('url'),
                'first_alerted_date': today_str,
                'last_alerted_date': today_str,
                'last_alerted_ts': now_ts,
                'consecutive_days_same_price': 1,
                'muted_until_ts': 0.0
            }
        else:
            old_price = float(existing.get('price', price))

            if price != old_price:
                if price < old_price:
                    # 2a. Price dropped: alert immediately, reset consecutive days and clear mute
                    should_alert = True
                    updated = dict(existing)
                    updated.update({
                        'name': item['name'],
                        'price': price,
                        'mrp': item['mrp'],
                        'discount': item['discount'],
                        'category': item.get('category'),
                        'url': item.get('url'),
                        'last_alerted_date': today_str,
                        'last_alerted_ts': now_ts,
                        'consecutive_days_same_price': 1,
                        'muted_until_ts': 0.0
                    })
                    pending_state_updates[item_id] = updated
                else:
                    # 2b. Price increased: update stored price in state, do NOT break active mute
                    updated = dict(existing)
                    updated.update({
                        'price': price,
                        'mrp': item['mrp'],
                        'discount': item['discount']
                    })
                    muted_until = existing.get('muted_until_ts', 0.0)
                    if now_ts >= muted_until and existing.get('last_alerted_date') != today_str:
                        should_alert = True
                        updated.update({
                            'last_alerted_date': today_str,
                            'last_alerted_ts': now_ts,
                            'consecutive_days_same_price': 1
                        })
                    pending_state_updates[item_id] = updated
            else:
                # 3. Price remains the SAME
                muted_until = existing.get('muted_until_ts', 0.0)
                consecutive_days = existing.get('consecutive_days_same_price', 1)

                # If 15-day mute expired, reset consecutive days to 0 so post-mute alert records as Day 1
                if muted_until > 0 and now_ts >= muted_until:
                    consecutive_days = 0
                    muted_until = 0.0

                updated = dict(existing)
                updated['muted_until_ts'] = muted_until
                updated['consecutive_days_same_price'] = consecutive_days

                if now_ts < muted_until:
                    # Within active 15-day mute: do not alert
                    should_alert = False
                    pending_state_updates[item_id] = updated
                elif existing.get('last_alerted_date') == today_str:
                    # Already alerted today at same price: do not alert
                    should_alert = False
                    pending_state_updates[item_id] = updated
                else:
                    # New calendar day! ("It should refresh every day")
                    if consecutive_days < 2:
                        should_alert = True
                        updated.update({
                            'last_alerted_date': today_str,
                            'last_alerted_ts': now_ts,
                            'consecutive_days_same_price': consecutive_days + 1
                        })
                        pending_state_updates[item_id] = updated
                    else:
                        # Price remained same for whole 2 days! Mute for 15 days
                        should_alert = False
                        updated['muted_until_ts'] = now_ts + (15 * 86400)
                        log(f"  [i] Muting \"{item['name'][:30]}\" for 15 days (same price for 2 days).")
                        pending_state_updates[item_id] = updated

        if should_alert:
            fresh_deals.append(item)

    log(f"✔ {len(fresh_deals)} deals ready for Telegram alert (after hourly/daily/15-day filters).")

    # Send alerts to Telegram
    notify_success = notify_deals(fresh_deals, is_test=is_test)

    # Only commit updated state if Telegram send succeeded (or if no deals to notify)
    if notify_success or not fresh_deals:
        state.update(pending_state_updates)

        # Clean inactive state records older than 30 days
        cutoff_time = now_ts - (30 * 86400)
        cleaned_state = {}
        for k, v in state.items():
            ts = v.get('last_alerted_ts', 0)
            if ts >= cutoff_time or v.get('muted_until_ts', 0) > now_ts:
                cleaned_state[k] = v
        save_state(cleaned_state)
        log("✔ State updated and saved.")
    else:
        log("⚠ Notice: Telegram alerts failed. State not updated so deals will retry on next run.")

    duration = (datetime.now() - start_time).total_seconds()
    log(f"✨ Run completed in {duration:.1f}s.")


def run_loop(interval_seconds: int = 3600):
    log(f"\n==================================================")
    log(f"🕒 Zepto Quick Scan Daemon Started")
    log(f"   Interval: Every {interval_seconds // 60} minutes ({interval_seconds}s)")
    log(f"   Press Ctrl+C to stop.")
    log(f"==================================================")

    while True:
        try:
            run_once()
        except KeyboardInterrupt:
            log("\nDaemon stopped by user.")
            break
        except Exception as e:
            log(f"\n[!] Unexpected error during run: {e}")

        log(f"\nSleeping for {interval_seconds // 60} minutes until next hourly scan...")
        try:
            time.sleep(interval_seconds)
        except KeyboardInterrupt:
            log("\nDaemon stopped by user.")
            break


def main():
    parser = argparse.ArgumentParser(description="Zepto Quick Scan Deals Bot (Headless)")
    parser.add_argument('--test', action='store_true', help="Run quick dry-run test (first 2 categories, 2 pages)")
    parser.add_argument('--loop', action='store_true', help="Run continuously every hour in background")
    parser.add_argument('--interval', type=int, default=3600, help="Interval in seconds for --loop (default: 3600 = 1 hour)")
    args = parser.parse_args()

    if args.loop:
        run_loop(interval_seconds=args.interval)
    else:
        run_once(is_test=args.test)


if __name__ == '__main__':
    main()
