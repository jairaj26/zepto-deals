# ⚡ Zepto Deals Tracker & Product Sorter

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-blue.svg)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Headless-purple.svg)](https://playwright.dev/)

An open-source toolkit to track, extract, sort, and get instant notifications for deep discount deals (**70%+ OFF**) on **Zepto**.

This repository contains two complementary tools:
1. **Interactive Browser Bookmarklet (`zepto-deals-bookmarklet.js`)**: Run directly in your browser on `zepto.com` to browse deals in a modern Zepto-style 5-column product grid with dropdown filters and CSV export.
2. **Automated Alert Bot (`zepto-bot.js`)**: Runs hourly in GitHub Actions (100% free) or locally to scrape key grocery subcategories, automatically deduplicate deals with a **2-hour price suppression rule**, and send instant alerts to your **Telegram** or **Discord**.

---

## 📑 Table of Contents
- [Features](#-features)
- [Tool 1: Interactive Browser Bookmarklet](#-tool-1-interactive-browser-bookmarklet)
- [Tool 2: Automated Telegram / Discord Bot](#-tool-2-automated-telegram--discord-bot)
  - [1. Fork the Repository](#1-fork-the-repository)
  - [2. Configure GitHub Secrets](#2-configure-github-secrets)
  - [3. Enable GitHub Actions Workflow](#3-enable-github-actions-workflow)
- [Running Locally](#-running-locally)
- [How 2-Hour Price Suppression Works](#-how-2-hour-price-suppression-works)
- [Privacy & Security](#-privacy--security)
- [License](#-license)

---

## ✨ Features

- **🚀 Zero DOM Scraping**: Fetches deals directly via Zepto's Next.js RSC & BFF Gateway APIs for maximum speed and zero UI lag.
- **🛍️ Zepto Grid UI**: Displays products in a 5-in-a-row responsive grid with product images, discount tags, MRP, selling price, and direct links to product pages.
- **📦 Stock & Availability Detection**: Accurately flags Out-of-Stock (OOS) items with dimmed styling and modern badges.
- **🔍 Powerful Dropdowns**: Filter deals on the fly by Subcategory, Minimum Discount (e.g. 50%+, 70%+), Stock Availability, and Sort Order (Discount High-to-Low, Price Low-to-High, etc.).
- **⏱️ Smart 2-Hour Price Suppression**: The alert bot avoids notification spam by muting items that remain at the same price for 2+ consecutive checks within the same day, while immediately unmuting if the price drops further.
- **🔒 Privacy First**: Zero personal credentials, tokens, or locations are hardcoded. All configurations use environment variables and GitHub Secrets.

---

## 🌐 Tool 1: Interactive Browser Bookmarklet

The bookmarklet (`zepto-deals-bookmarklet.js`) runs client-side in your desktop browser while you are logged in or browsing `zepto.com`.

### How to Use

#### Method A: Browser Console (Fastest)
1. Open [zepto.com](https://www.zepto.com) in Chrome / Edge / Brave / Firefox.
2. Ensure your delivery address/location is selected.
3. Press `F12` (or `Ctrl+Shift+I` / `Cmd+Option+I`) to open Developer Tools and go to the **Console** tab.
4. Copy the entire contents of [`zepto-deals-bookmarklet.js`](./zepto-deals-bookmarklet.js), paste into the console, and press **Enter**.
5. The Zepto Deals drawer will appear on the right side of the screen.

#### Method B: Browser Bookmark
1. Create a new bookmark in your browser bookmarks bar (e.g. named `Zepto Deals`).
2. Set the URL to the following loader:
   ```javascript
   javascript:(function(){const s=document.createElement('script');s.src='https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto-deals-bookmarklet.js?t='+Date.now();document.head.appendChild(s);})();
   ```
3. Whenever you are on [zepto.com](https://www.zepto.com), simply click your bookmark!

> [!NOTE]
> **Subcategory Cap**: To prevent triggering excessive API calls and rate-limits, you can select up to **2 subcategories per category** at a time.

---

## 🤖 Tool 2: Automated Telegram / Discord Bot

The bot (`zepto-bot.js`) autonomously launches headless Chromium via Playwright to establish a fresh Zepto session, extracts deals across key staple subcategories (*Atta, Oil, Ghee, Dals & Pulses, Rice & More*), applies price deduplication, and sends alerts to Telegram or Discord.

### 1. Fork the Repository
Click the **Fork** button at the top right of this GitHub repository to create your own copy.

### 2. Configure GitHub Secrets
In your forked repository, navigate to **Settings** > **Secrets and variables** > **Actions**, and click **New repository secret** for each of the following:

| Secret Name | Required? | Description | Example |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **Yes** (for Telegram) | Telegram Bot token obtained from [@BotFather](https://t.me/BotFather) | `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ` |
| `TELEGRAM_CHAT_ID` | **Yes** (for Telegram) | Your Telegram Chat or Channel ID (from [@userinfobot](https://t.me/userinfobot)) | `987654321` |
| `USER_LATITUDE` | Optional (Recommended) | Delivery location latitude (defaults to `12.9716`) | `12.9716` |
| `USER_LONGITUDE` | Optional (Recommended) | Delivery location longitude (defaults to `77.5946`) | `77.5946` |
| `DISCORD_WEBHOOK_URL` | Optional | Discord Webhook URL for Discord notifications | `https://discord.com/api/webhooks/...` |

> [!TIP]
> **How to find your Latitude and Longitude**:
> 1. Open [Google Maps](https://maps.google.com).
> 2. Right-click on your delivery location.
> 3. The first entry in the menu will be your coordinates (e.g. `12.9716, 77.5946`). The first number is Latitude and the second is Longitude.

### 3. Enable GitHub Actions Workflow
1. Go to the **Actions** tab in your repository.
2. If prompted, click **I understand my workflows, go ahead and enable them**.
3. Select **Zepto Deals Alert Bot** from the left sidebar.
4. Click **Run workflow** > **Run workflow** to perform a manual test run.
5. Once verified, the bot will run automatically at the top of every hour via the scheduled cron trigger (`0 * * * *`).

---

## 💻 Running Locally

You can also run the bot locally on your machine with Node.js:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/jairaj26/zepto-deals.git
   cd zepto-deals
   ```

2. **Install dependencies**:
   ```bash
   npm install
   npx playwright install chromium
   ```

3. **Configure environment variables**:
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in your `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and your coordinates (`USER_LATITUDE`, `USER_LONGITUDE`).

4. **Run the bot**:
   ```bash
   npm start
   ```

> [!NOTE]
> If neither `TELEGRAM_BOT_TOKEN` nor `DISCORD_WEBHOOK_URL` is set in `.env`, the bot will automatically output all discovered deals directly to your console!

---

## 🧠 How 2-Hour Price Suppression Works

To prevent receiving repeated alerts for the same discounted product every single hour:
1. **New Deal Found**: When a product enters the $\ge 70\%$ off threshold for the first time today, an alert is sent immediately, and recorded in `deals_state.json`.
2. **Consecutive Identical Price**: If the same product remains at the exact same price during the next run (2nd consecutive hour), it is marked as `mutedForToday = true`. No further alerts will be sent for this item today.
3. **Price Drops Further**: If the price drops even lower (e.g., from ₹100 to ₹70), the bot automatically un-mutes the product and sends a price-drop alert!
4. **Daily State Reset**: At midnight (UTC / new calendar date), `deals_state.json` resets, ensuring you receive fresh notifications for the new day's deals.

---

## 🛡️ Privacy & Security

- **No Hardcoded Credentials**: No personal phone numbers, user IDs, addresses, or tokens are included in the repository.
- **Safe Dynamic Capturing**: Sessions are established live via ephemeral headless browser contexts or user browser sessions.
- **Clean Commit History**: Sensitive `.env` files and local files are excluded via `.gitignore`.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
