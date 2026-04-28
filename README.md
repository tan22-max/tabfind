# tabfind
# TabFind — Tab Search Chrome Extension

A keyboard-driven Chrome extension for instantly searching, navigating, and annotating your open tabs using fuzzy search.

---

## Features

- **Fuzzy search** across tab titles, URLs, and personal notes
- **Filter modes** — search by All, Title, URL, or Notes
- **Tab notes** — attach persistent notes to any tab, saved across sessions via `chrome.storage`
- **Keyboard navigation** — move through results and open tabs without touching the mouse
- **Close tabs** directly from the search popup
- **Match highlighting** — matched characters are highlighted in results
- **Active tab indicator** — a colored bar marks your currently active tab

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+F` / `Cmd+Shift+F` | Open the popup |
| `↑` / `↓` | Move focus through results |
| `Enter` | Switch to focused tab |
| `Esc` | Clear search input |
| `N` | Open notes for focused tab (when search box is not focused) |
| `Ctrl+Enter` / `Cmd+Enter` | Save note (when notes panel is open) |

---

## Installation

This extension is not published to the Chrome Web Store. Install it manually as an unpacked extension:

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `tab-search` folder.
5. The extension icon will appear in your toolbar.

---

## Project Structure

```
tab-search/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker (minimal — logs install event)
├── popup.html          # Extension popup UI
├── popup.js            # All core logic (search, notes, keyboard nav)
├── popup.css           # Dark-theme styles
└── icons/
    ├── icon16.png/.svg
    ├── icon48.png/.svg
    └── icon128.png/.svg
```

---

## How It Works

### Search
When the popup opens, all tabs are loaded via `chrome.tabs.query`. As you type, each tab is scored using a two-pass fuzzy matcher:

1. **Exact match** — if the query appears directly in the string, it scores highest.
2. **Fuzzy match** — if all query characters appear in order (e.g. `"ggl"` matches `"google"`), a lower score is assigned based on how consecutive the matches are.

Matches in **titles** are weighted 1.5×, **notes** 1.2×, and **URLs** 1×. Results are sorted by score, highest first.

### Notes
Notes are stored per tab ID using `chrome.storage.local`, so they persist between browser sessions. A note preview is shown below the tab URL in the results list. Notes can be saved, edited, or deleted from the notes panel.

### Filter Modes
The **All / Title / URL / Notes** pill buttons restrict which fields are searched. Only the active filter is evaluated during scoring.

---

## Permissions

| Permission | Reason |
|------------|--------|
| `tabs` | Read tab titles, URLs, favicons, and IDs |
| `storage` | Persist notes between sessions |
| `activeTab` | Switch to a selected tab |

---

## Design

- **Font:** Syne (UI) + DM Mono (monospace elements) via Google Fonts
- **Theme:** Dark, with a green (`#7effc4`) and blue (`#4fd1ff`) accent palette
- **Popup size:** 600px wide, 480–620px tall
