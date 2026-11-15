# ⚡ Zepto Deals Tracker & Automated Telegram Bot

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Userscript](https://img.shields.io/badge/Userscript-Tampermonkey%20%2F%20Violentmonkey-purple.svg)](https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto_deals.user.js)
[![Bookmarklet](https://img.shields.io/badge/Bookmarklet-1--Click%20Drag-orange.svg)](https://jairaj26.github.io/zepto-deals/)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)

An open-source toolkit and headless background automation to discover, track, and alert on deep discount deals (**≥ 50% OFF**, **flash ₹1–₹5 items**, and **Quick Scan ≤ ₹100**) on **Zepto**.

Includes two powerful ways to track deals:
1. **🤖 Automated Headless Telegram Bot** (`zepto_quick_scan.py`): Runs silently in the background on your PC via Windows Task Scheduler. Scans all 11 Quick Scan categories every hour using a persistent Chrome session, bypasses AWS WAF bot challenges, enforces smart deduplication, and sends instant alerts to Telegram.
2. **🌐 Interactive Browser Userscript & Bookmarklet** (`zepto_deals.user.js`): Browse live inventory, sort by discount, filter subcategories, and search products directly on `zepto.com` with a 5-column product grid and CSV export.

> 🌐 **1-Click Web Installer**: [https://jairaj26.github.io/zepto-deals/](https://jairaj26.github.io/zepto-deals/)  
> Visit the portal to install the Userscript or drag the Bookmarklet to your browser bookmarks bar with a single click.

---

## 📑 Table of Contents
- [🤖 Part 1: Automated Headless Telegram Bot](#-part-1-automated-headless-telegram-bot)
  - [How It Works](#how-it-works)
  - [Prerequisites & Installation](#prerequisites--installation)
  - [Configuration (.env)](#configuration-env)
  - [Running the Bot](#running-the-bot)
  - [24/7 Windows Task Scheduler Setup](#247-windows-task-scheduler-setup)
  - [Smart Deduplication & Alerting Rules](#smart-deduplication--alerting-rules)
- [🌐 Part 2: Browser Userscript & Bookmarklet](#-part-2-browser-userscript--bookmarklet)
  - [Why Userscript / Bookmarklet?](#why-userscript--bookmarklet)
  - [Key Features](#key-features)
  - [Method 1: Automatic Userscript (Tampermonkey / Violentmonkey)](#method-1-automatic-userscript-tampermonkey--violentmonkey)
  - [Method 2: Browser Bookmarklet](#method-2-browser-bookmarklet)
  - [Method 3: Browser Console](#method-3-browser-console)
- [🔒 Privacy & Security](#-privacy--security)
- [📄 License](#-license)

---

## 🤖 Part 1: Automated Headless Telegram Bot

### How It Works
Zepto protects its endpoints with strict AWS WAF Bot Control that challenges automated server IPs (such as GitHub Actions or cloud VPS). The headless scanner bypasses this by running locally on your PC via Playwright:
* Launches Google Chrome headless with a persistent browser profile (`chrome_profile/`).
* Intercepts authentic session cookies (`XSRF-TOKEN`, `csrfSecret`) and device tokens.
* Scans all 11 Quick Scan categories (`Grocery`, `Dairy`, `Masala`, `Sauces`, `Packaged Goods`, `Cleaning`, `Household`, `Oral Care`, `Skincare`, `Haircare`, `Bath`).
* Fetches up to 2 pages per category with strict client-side price (`≤ ₹100`) and discount filters (`≥ 50% OFF`). Never drops ₹1–₹5 flash deals.
* Formats and batches alerts cleanly for Telegram without distracting image previews.

---

### Prerequisites & Installation

1. **Python 3.10+**: Ensure Python is installed and added to your system `PATH`.
2. **Install Python Dependencies**:
   ```bash
   pip install requests playwright
   playwright install chromium
   ```

---

### Configuration (.env)

Copy `.env.example` to `.env` and fill in your Telegram Bot credentials:
```bash
cp .env.example .env
```

Edit `.env`:
```ini
# Telegram Bot Credentials
TELEGRAM_BOT_TOKEN="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
TELEGRAM_CHAT_ID="987654321"

# Quick Scan Filter Parameters
MAX_PRICE=100
PAGES_PER_CATEGORY=2
MIN_DISCOUNT_PERCENT=50

# Link text on Telegram
STORE_LINK_TEXT=Buy on Zepto ⚡️

# Delivery Location Coordinates (Optional, defaults to Central Bengaluru)
USER_LATITUDE=12.9716
USER_LONGITUDE=77.5946
```

> **How to get Telegram Bot credentials:**
> 1. Message **[@BotFather](https://t.me/botfather)** on Telegram to create a new bot and copy your `TELEGRAM_BOT_TOKEN`.
> 2. Message **[@userinfobot](https://t.me/userinfobot)** or **[@raw_data_bot](https://t.me/raw_data_bot)** to get your numeric `TELEGRAM_CHAT_ID`.
> 3. Send `/start` to your newly created bot so it has permission to message you.

---

### Running the Bot

* **Run Once (Manual Test)**:
  ```bash
  python zepto_quick_scan.py
  ```
  *(Or simply double-click `run_scan.bat` on Windows).*

* **Run Continuous Loop (Background Daemon)**:
  ```bash
  python zepto_quick_scan.py --loop --interval 3600
  ```

---

### 24/7 Windows Task Scheduler Setup

To run the bot silently in the background every hour and automatically restart after PC reboots:

1. Right-click **`setup_task.bat`** and select **"Run as administrator"** (or double-click it and accept the UAC elevation prompt).
2. The installer will register the `ZeptoQuickScanBot` Windows Scheduled Task with:
   * **Hourly Repeat**: Runs every 1 hour indefinitely using `pythonw.exe` (no popup console window).
   * **Battery & AC Support**: Executes reliably on both battery and AC power (prevents `0x800710e0` battery blocks).
   * **Auto-Start on Boot / Logon**: Immediately triggers a scan when you start or restart your PC and log in.
   * **Missed Task Catch-up**: Runs missed scans automatically when your PC wakes from sleep (`StartWhenAvailable`).

**Useful Task Scheduler Commands:**
```cmd
:: Trigger an immediate run
schtasks /run /tn "ZeptoQuickScanBot"

:: Check status and last run result
schtasks /query /tn "ZeptoQuickScanBot" /v /fo LIST

:: Delete scheduled task
schtasks /delete /tn "ZeptoQuickScanBot" /f
```

---

### Smart Deduplication & Alerting Rules

All deal tracking state is saved locally in `deals_state.json`:
* **Hourly Mute**: If a product price is unchanged between consecutive hours, it is suppressed.
* **Price Drop Alert**: If a product drops in price, it alerts immediately, resets the mute counter, and un-mutes the product.
* **Price Increase Handling**: If the price increases, state updates silently without alerting or breaking an existing mute.
* **Daily Refresh**: Products remaining at the same price are alerted once per day for up to 2 consecutive days.
* **15-Day Long-Term Mute**: If an item remains at the exact same discounted price for 2 full consecutive days, it is muted for 15 days so your Telegram feed stays fresh.
* **Zero Discard for Flash Deals**: ₹1–₹5 flash deals with 0% nominal MRP discount are always captured.

---

## 🌐 Part 2: Browser Userscript & Bookmarklet

### Why Userscript / Bookmarklet?
By running 100% client-side in your desktop or mobile browser:
1. **Zero WAF Challenges**: You browse with your domestic IP and natural browser fingerprint.
2. **Instant & Always Up-to-Date**: Your selected delivery address, pincode, store ID, and session cookies are automatically used.
3. **No Setup Hassle**: No servers or external tokens required.

---

### Key Features
- **🚀 Zero DOM Scraping**: Fetches directly via Zepto's Next.js RSC and BFF Gateway APIs.
- **⚡ Blockbuster Deals Hub**: Pinned at the top of the category drawer with live dynamic refresh.
- **🔍 Quick Scan**: Scans all 11 categories in one click for items ≤ ₹51 directly in the browser.
- **🛍️ Zepto-Style 5-Column Grid**: Beautiful modal displaying product cards with discount badges, MRP, selling price, and instant links.
- **📦 Stock & Availability Detection**: Accurately detects Out-of-Stock (OOS) items.
- **🔍 Real-Time Dropdown Filters**: Filter by Subcategory, Minimum Discount (50%+, 60%+, 70%+), In-Stock only, and Price sorting.
- **📥 CSV Export**: Export all filtered deals with product titles, discounts, and prices in 1 click.

---

### Method 1: Automatic Userscript (Tampermonkey / Violentmonkey)

1. Install [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/) from your browser extension store.
2. Click this direct install link:  
   👉 **[Install Zepto Deals Userscript](https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto_deals.user.js)**
3. Confirm installation in the extension prompt.
4. Visit [zepto.com](https://www.zepto.com) — a purple floating **⚡ Deals** button will appear in the bottom-right corner!

*Mobile Support:*
* **Android**: Works on Firefox Mobile or Microsoft Edge Mobile with Violentmonkey/Tampermonkey installed.
* **iOS**: Works on Safari using [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) or [Stay](https://apps.apple.com/app/stay-for-safari/id1591620924).

---

### Method 2: Browser Bookmarklet

1. Make sure your bookmarks bar is visible (`Ctrl+Shift+B` or `Cmd+Shift+B`).
2. Visit the [Web Installer Page](https://jairaj26.github.io/zepto-deals/) and drag the green **"⚡ Zepto Deals"** button to your bookmarks bar.
3. *Alternatively*, create a bookmark manually and paste the encoded code from [`bookmarklet.txt`](./bookmarklet.txt).
4. While on [zepto.com](https://www.zepto.com), click the bookmark!

---

### Method 3: Browser Console

1. Open [zepto.com](https://www.zepto.com) in your browser.
2. Press `F12` (or right-click > **Inspect**) and go to the **Console** tab.
3. Copy the entire code from [`zepto-deals-bookmarklet.js`](./zepto-deals-bookmarklet.js), paste into the console, and hit **Enter**.

---

## 🔒 Privacy & Security

- **100% Client-Side**: All browser requests occur directly between your browser and Zepto's official endpoints.
- **Zero Data Collection**: No cookies, session headers, GPS coordinates, or personal credentials are sent to any third-party server.
- **Git Safety**: The included `.gitignore` protects `.env`, `chrome_profile/`, `deals_state.json`, and scan logs from being tracked in version control.
- **Open Source**: Every line of code is completely transparent and inspectable in this repository.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
