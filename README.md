# ⚡ Zepto Deals Tracker & Product Sorter

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Userscript](https://img.shields.io/badge/Userscript-Tampermonkey%20%2F%20Violentmonkey-purple.svg)](https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto_deals.user.js)
[![Bookmarklet](https://img.shields.io/badge/Bookmarklet-1--Click%20Drag-orange.svg)](https://jairaj26.github.io/zepto-deals/)

An open-source toolkit to track, extract, filter, and sort deep discount deals (**50%+, 70%+ OFF**) on **Zepto** directly in your browser.

> 🌐 **1-Click Web Installer**: [https://jairaj26.github.io/zepto-deals/](https://jairaj26.github.io/zepto-deals/)  
> Visit the portal to install the Userscript or drag the Bookmarklet to your bookmarks bar with a single click.

---

## 📑 Table of Contents
- [Why Userscript / Bookmarklet?](#-why-userscript--bookmarklet)
- [✨ Features](#-features)
- [🚀 Method 1: Automatic Userscript (Recommended for PC & Mobile)](#-method-1-automatic-userscript-recommended-for-pc--mobile)
  - [Setup on PC (Chrome, Edge, Brave, Firefox)](#setup-on-pc-chrome-edge-brave-firefox)
  - [Setup on Android (Kiwi Browser or Firefox Mobile)](#setup-on-android-kiwi-browser-or-firefox-mobile)
  - [Setup on iOS (Safari)](#setup-on-ios-safari)
- [🔖 Method 2: Browser Bookmarklet](#-method-2-browser-bookmarklet)
- [💻 Method 3: Browser Console](#-method-3-browser-console)
- [🔒 Privacy & Security](#-privacy--security)
- [📄 License](#-license)

---

## 💡 Why Userscript / Bookmarklet?

Zepto's APIs are protected by strict AWS WAF Bot Control that aggressively challenges and blocks automated datacenter IPs (like GitHub Actions runners or cloud VPS). 

By running **100% client-side** in your real browser (Desktop or Mobile):
1. **Zero WAF Challenges**: You browse with your regular domestic internet connection and natural browser fingerprints, bypassing bot blocks seamlessly.
2. **Instant & Always Up-to-Date**: Your selected delivery address, pincode, store ID, and session cookies are automatically used.
3. **No Setup Hassle**: No Telegram bots, no API tokens, and no server maintenance required.

---

## ✨ Features

- **🚀 Zero DOM Scraping**: Directly fetches data via Zepto's Next.js RSC & BFF Gateway APIs for lightning-fast loading without slow UI scrolling.
- **🛍️ Zepto-Style 5-Column Grid**: Beautiful, clean product grid showing product images, discount tags, MRP, selling price, and instant links to Zepto product pages.
- **📦 Stock & Availability Detection**: Detects Out-of-Stock (OOS) items accurately and dims them with clear OOS badges.
- **🔍 Real-Time Dropdown Filters**:
  - Filter by Subcategory.
  - Filter by Minimum Discount (e.g. 50%+, 60%+, 70%+ OFF).
  - Filter by In-Stock only.
  - Sort by Discount (High to Low) or Price (Low to High / High to Low).
- **📥 CSV Export**: Export all filtered deals with product titles, discounts, and prices to a CSV file in 1 click.
- **🛡️ Rate-Limit Safe**: Safely capped to 2 subcategories per category at a time to prevent API throttling.

---

## 🚀 Method 1: Automatic Userscript (Recommended for PC & Mobile)

The Userscript (`zepto_deals.user.js`) is the easiest and most seamless way to use the deal finder. Once installed, it **automatically runs in the background** whenever you open `zepto.com`. A stylish floating **⚡ Deals** button appears in the corner.

### Setup on PC (Chrome, Edge, Brave, Firefox)
1. Install either [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/) from your browser extension store.
2. Click this direct install link:  
   👉 **[Install Zepto Deals Userscript](https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto_deals.user.js)**
3. Tampermonkey/Violentmonkey will prompt you — click **Install** / **Confirm Install**.
4. Visit [zepto.com](https://www.zepto.com) — you will see a purple floating button in the bottom-right corner!

### Setup on Android (Kiwi Browser or Firefox Mobile)
Standard mobile Chrome does not support extensions. However, Kiwi Browser and Firefox Mobile do:
1. Install **[Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser)** or **[Firefox](https://play.google.com/store/apps/details?id=org.mozilla.firefox)** from Google Play.
2. In Kiwi/Firefox, open the Chrome Web Store or Firefox Add-ons and install **Violentmonkey** or **Tampermonkey**.
3. Tap **[Install Zepto Deals Userscript](https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto_deals.user.js)** and confirm installation.
4. Open [zepto.com](https://www.zepto.com). The floating button will appear on the page automatically!

### Setup on iOS (Safari)
1. Install the free **[Userscripts](https://apps.apple.com/app/userscripts/id1463298887)** or **[Stay](https://apps.apple.com/app/stay-for-safari/id1591620924)** extension from the App Store.
2. Enable the extension in **Settings > Safari > Extensions**.
3. Add `https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto_deals.user.js` to your scripts.
4. Open [zepto.com](https://www.zepto.com) in Safari.

---

## 🔖 Method 2: Browser Bookmarklet

If you prefer not to install extensions, you can use the bookmarklet on desktop:

1. Make sure your bookmarks bar is visible (`Ctrl+Shift+B` or `Cmd+Shift+B`).
2. Visit the [Web Installer Page](https://jairaj26.github.io/zepto-deals/) and **drag the green "⚡ Zepto Deals" button** into your bookmarks bar.
3. *Alternatively*, create a new bookmark manually and set the URL to:
   ```javascript
   javascript:(function(){const s=document.createElement('script');s.src='https://raw.githubusercontent.com/jairaj26/zepto-deals/main/zepto-deals-bookmarklet.js?t='+Date.now();document.head.appendChild(s);})();
   ```
4. While on [zepto.com](https://www.zepto.com), simply click your bookmark!

---

## 💻 Method 3: Browser Console

1. Open [zepto.com](https://www.zepto.com) in your browser.
2. Press `F12` (or right-click > **Inspect**) and navigate to the **Console** tab.
3. Open [`zepto-deals-bookmarklet.js`](./zepto-deals-bookmarklet.js), copy the entire code, paste it into the console, and hit **Enter**.

---

## 🔒 Privacy & Security

- **100% Client-Side**: All requests occur directly between your browser and Zepto's official endpoints.
- **Zero Data Collection**: No cookies, session headers, GPS coordinates, or personal info are logged or sent to any external server.
- **Open Source**: Every line of code is completely transparent and viewable in this repository.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
