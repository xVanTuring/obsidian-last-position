# Last Position

![Obsidian](https://img.shields.io/badge/Obsidian-%23483699?style=for-the-badge&logo=obsidian&logoColor=white)
![License](https://img.shields.io/github/license/xVanTuring/obsidian-last-position?style=for-the-badge)

English | [中文](README.md)

Last Position is an Obsidian plugin that saves and restores Markdown scroll positions per workspace leaf, keeping reading and editing continuous across files and tabs.

> This repository is a fork of [Saktawdi/obsidian-last-position](https://github.com/Saktawdi/obsidian-last-position). Key change: scroll progress is stored in line-based TSV text files instead of JSON (see [Data storage](#data-storage)), which is **recommended for vaults synchronized with git** (see [Working with git sync](#working-with-git-sync)).

## Features

- Saves and restores positions per tab in editing mode, reading mode, split panes, and multiple tabs showing the same file.
- Respects heading and block-reference navigation instead of overriding anchors with saved history.
- Provides a “To last position” command for returning to the current file's saved position.
- Provides named position bookmarks with search, jump, and removal; duplicate names receive numeric suffixes.
- Shows the current height in the status bar; left-click saves a bookmark and right-click opens the current file's bookmark list.
- Supports a fixed restore delay, Smart Restore Delay (Beta), a maximum attempt count, and a retry interval.
- Provides a paginated position table, deletion, JSON import/export, and optional cleanup of expired data.
- Stores scroll progress in line-based TSV text files that merge cleanly in git.
- Includes Chinese and English interfaces and is available on desktop and mobile Obsidian.

## Installation

### Build from source (recommended for this fork)

```bash
git clone git@github.com:xVanTuring/obsidian-last-position.git
cd obsidian-last-position
npm install && npm run build
```

Copy the generated `main.js` together with `manifest.json` and `styles.css` into your vault's `.obsidian/plugins/last-position/`, reload Obsidian, and enable Last Position under “Settings → Community plugins”.

### Community Plugins (upstream build, without the TSV storage changes)

1. Open “Settings → Community plugins” in Obsidian.
2. Disable Restricted mode if prompted, then select “Browse”.
3. Search for “Last Position”, install it, and enable the plugin.

### Manual installation from GitHub Releases

1. Download `main.js`, `manifest.json`, and `styles.css` for the same version from the [Releases](https://github.com/xVanTuring/obsidian-last-position/releases) page.
2. Create `.obsidian/plugins/last-position/` inside your Obsidian vault.
3. Copy the three files into that folder.
4. Reload Obsidian and enable Last Position under “Settings → Community plugins”.

Obsidian `1.8.0` or later is required.

## Usage

Once enabled, the plugin records Markdown view positions automatically and restores them when files or tabs are reopened. Heading and block-reference link targets take priority over saved history.

The following commands are available from the command palette:

- `Last Position: To last position`
- `Last Position: Save Bookmark`
- `Last Position: Select Bookmark`
- `Last Position: Remove Bookmark`

The status bar shows the current scroll height. Left-click it to save the current position as a bookmark, or right-click it to open the current file's bookmark list.

## Configuration

- **Auto Save**: debounce interval for saving positions; defaults to `3` seconds and takes effect after restarting the plugin.
- **Listen Event**: event that triggers position saving; supports mouseover, click, or scroll, defaults to `mouseover`, and takes effect after restarting the plugin.
- **Smart Restore Delay (Beta)**: calculates a delay from the source and target note lengths; disabled by default and overrides the fixed delay when enabled.
- **Restore Delay**: fixed wait used when smart delay is disabled; defaults to `300` ms.
- **Retry Count**: maximum restore attempts; defaults to `30` and takes effect after restarting the plugin.
- **Restore Retry Interval**: wait between restore attempts; defaults to `100` ms.
- **Page Size**: shows `5`, `10`, `20`, or `50` position records per page; defaults to `10`.
- **Auto Cleanup**: removes expired position data when the plugin starts; disabled by default.
- **Cleanup Days**: configurable from `7–365` days; defaults to `30`.
- **Data Import/Export**: exports positions and bookmarks as JSON or merges validated compatible data into the current store.

## Data storage

Scroll progress is no longer written into `data.json`. It lives in two plain-text files inside the plugin folder (`.obsidian/plugins/last-position/`):

- `positions.tsv`: one line per note (`path<TAB>height<TAB>lastAccessed`), sorted by path.
- `bookmarks.tsv`: one line per bookmark (`path<TAB>name<TAB>height<TAB>createdAt`).
- `data.json`: only UI settings and per-leaf (leafId) session data; leaf ids are meaningful on a single machine only, so they stay out of the synced files.

The TSV format is one sorted record per line, designed for git: changes to different records land on different lines, so git's line-based three-way merge usually resolves them automatically. If a conflict does happen (both branches touched adjacent lines), you can keep both sides' lines — parsing is lenient: conflict-marker lines are skipped and duplicate paths resolve to the newer timestamp. External edits such as `git pull` are detected and applied the next time a file is opened.

When versioning your vault with git, make sure `positions.tsv` and `bookmarks.tsv` are not excluded by `.gitignore`. The Import/Export feature keeps using JSON — that is a cross-device exchange format, unrelated to local storage.

## Working with git sync

This fork is recommended for vaults **versioned with git** (with the [Obsidian Git](https://github.com/denki/obsidian-git) plugin auto-committing, or manual commits — both work):

1. Put the whole vault (including `.obsidian/`) under git and push it to a remote such as GitHub.
2. Make sure `.gitignore` does **not** exclude `.obsidian/plugins/last-position/positions.tsv` and `bookmarks.tsv` — these two files are the sync payload.
3. Install and enable this plugin on every device. Device A scrolls and saves → the change gets committed; Device B runs `git pull` → the next time a note is opened, it restores to the position read on the other device, no Obsidian restart needed.
4. Concurrent progress edits merge automatically by line in the vast majority of cases. If adjacent records genuinely conflict, keep both sides (leaving the `<<<<<<<` marker lines in place is fine too) — the plugin resolves duplicates by newest timestamp.

On mobile, the same pull works via Working Copy (iOS) or Termux/obsidian-git (Android). Only the UI settings part of `data.json` is worth cross-device syncing; its `leaves` session data syncs harmlessly but only means anything to the device that produced it.

If you don't use git, this fork still works exactly like the original — progress simply lives in two plain-text files instead of `data.json`.

## Notes

- Bookmarks store scroll heights. Large document edits can shift the corresponding visual position.
- Long notes or notes with extensive asynchronous rendering may need a longer restore delay or more retry attempts.
- `main.js` is not committed to the source repository; download it from the GitHub Release assets.
- When reporting a problem in [GitHub Issues](https://github.com/xVanTuring/obsidian-last-position/issues), include the Obsidian version, platform, and reproduction steps.

## License

This project is licensed under the [MIT License](LICENSE).
