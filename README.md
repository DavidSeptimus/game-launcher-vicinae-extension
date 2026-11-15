# Game Launcher for Vicinae

Search and launch your installed Linux games from [Vicinae](https://vicinae.com), in the spirit of Flow Launcher's
GamesLauncher plugin. Steam is supported today; Heroic (Epic/GOG/Amazon) and Lutris are planned.

## Features

- **Search Games** command: a cover-art grid of installed games, most recently played first. The library is rescanned
  every time the command opens (Vicinae unloads it on close), so there's no manual refresh.
  Alias it to `gl` in Vicinae for Flow-style muscle memory.
- Settings (Ctrl+, from any game): grid or list (optionally with a details pane, Ctrl+D to toggle),
  grid artwork (cover, banner, hero, logo), games per row (auto or 2–8), and grid labels.
- Matches acronyms and App IDs as well as titles (`kcd` → *Kingdom Come: Deliverance II*).
- Hides Proton, the Steam Linux Runtime, and other Steam tools (toggle in preferences).
- Actions: launch, show in Steam library, open install folder, open store page, view on ProtonDB, copy App ID,
  hide/unhide.
- Hiding merges with Steam: games in Steam's Hidden collection are hidden here too. Unhiding one here only shows it
  here (Steam's data is never modified); hiding it again restores Steam's choice.
- The dropdown has a **Steam** section with Favorites and your manual collections (those with installed games).
  Dynamic (rule-based) collections aren't supported yet.
- Works with native, Flatpak (`com.valvesoftware.Steam`) and Snap Steam installs, and every Steam library folder.
- "Clear Artwork Cache…" in every game's action menu purges downloaded art (with confirmation).
- Sharp artwork on HiDPI screens: Steam's local cache only holds 1x art (300x450 covers, 32px icons), so by default
  the extension downloads 2x covers/banners from Steam's CDN and extracts the largest image from each game's client
  `.ico`, caching them under Vicinae's support directory (many games only ship a 32px icon; those keep it). Set "Artwork Source" to local-only to never download. Custom grid art from `userdata/*/config/grid` always
  wins and is never replaced by downloads.

## How it reads Steam

Everything is read locally from the Steam directory. The only network traffic is artwork downloads from
`cdn.cloudflare.steamstatic.com` (App ID + asset name only), which the "Artwork Source" preference can turn off.

| Data | Source |
| --- | --- |
| Library folders | `steamapps/libraryfolders.vdf` |
| Installed apps | `<library>/steamapps/appmanifest_*.acf` (`StateFlags` bit 4 = fully installed) |
| Game vs. tool | `appcache/appinfo.vdf` (binary, v27–v29), `common.type`; name-based fallback if unreadable. Type and icon hashes are remembered in `<support>/appinfo-cache.json`, so appinfo.vdf (which can be 100+ MB) is only read for newly installed games, or to re-check entries older than 30 days |
| Last played / playtime | `userdata/*/config/localconfig.vdf`, merged across accounts |
| Collections, Steam-hidden | `userdata/*/config/cloudstorage/cloud-storage-namespace-1.json` (`user-collections.*`), merged across accounts |
| Artwork | `appcache/librarycache/<appid>/…` (flat, per-app and hashed layouts), `userdata/*/config/grid` |
| Hi-res art | CDN `library_600x900_2x.jpg`, `library_header_2x.jpg`, client `.ico` → `<support>/artwork/steam/<appid>/` |

### Artwork resolution order

For each image: **custom grid art → downloaded 2x → Steam's local 1x → downloaded 1x** (the 1x CDN image is only
fetched when Steam has no local copy, since it would be identical). Only art the current layout shows is fetched.
Cached files refresh after 30 days, 404s are retried after 7, network errors on the next open. Art for uninstalled
games is pruned after each complete scan (skipped if any library folder is unreachable, e.g. an unmounted drive).
| Launch | `steam://rungameid/<appid>` via `xdg-open` |

## Development

Toolchain: the system Node 22 (the same runtime Vicinae runs extensions on) and pnpm.

```bash
pnpm install
pnpm dev          # live-reloading dev session inside the running Vicinae
pnpm test         # unit tests (synthetic Steam fixtures)
LOCAL_STEAM=1 pnpm test local-steam   # smoke test against this machine's Steam install
BENCH=1 pnpm exec vitest run scan-bench --silent=false   # scan timing on synthetic 500/2000-game libraries
pnpm typecheck
pnpm lint         # validates the manifest
pnpm build        # installs the built extension into ~/.local/share/vicinae/extensions
```

Layout:

```
src/search-games.tsx      the command: loads the library, picks grid or list
src/components/           GameGrid, GameList, shared action panel
src/lib/view-settings.ts  display preferences -> grid columns / aspect ratio / artwork choice
src/lib/artwork-cache.ts  hi-res artwork download cache (download, refresh, prune, clear)
src/lib/artwork-requests.ts  which art the current layout needs, per game
src/lib/image/            .ico extraction and a minimal PNG encoder (no native deps)
src/hooks/                useHiresArtwork: fills the cache in the background, re-renders as art arrives
src/lib/library.ts        aggregates all launchers into one sorted list
src/lib/game-views.ts     dropdown views: installed / hidden / collections
src/lib/visibility.ts     merged hidden rules (ours + Steam's, with "shown here" overrides)
src/lib/games.ts          launcher-agnostic Game model, sorting, acronym keywords
src/lib/steam/            Steam paths, manifest/library scan, appinfo.vdf, artwork
src/lib/vdf/              text and binary KeyValues parsers
assets-src/               icon source (SVG); rendered PNG lives in assets/
```

The extension icon is rendered from `assets-src/extension_icon.svg` with
`magick -background none -density 192 assets-src/extension_icon.svg -resize 512x512 assets/extension_icon.png`.
