import { compareGames, type Game, type GameCollection } from "./games";
import { AppInfoStore } from "./steam/appinfo-store";
import { scanSteamInstall } from "./steam/library";
import { findSteamInstalls } from "./steam/paths";

export interface LibraryOptions {
  steamPath?: string;
  includeNonGames?: boolean;
  /** Where to persist appinfo.vdf lookups between runs. Without it, appinfo.vdf is read on every scan. */
  appInfoCachePath?: string;
  /** Home directory to auto-detect launchers in (tests). Defaults to the real one. */
  home?: string;
}

export interface LibraryScan {
  games: Game[];
  warnings: string[];
  /** Human-readable list of where we looked / what we found, for the empty state. */
  sources: string[];
  /** Installed Steam app ids (including hidden tools), for pruning the artwork cache. */
  installedSteamAppids: Set<number>;
  /** False if any library was unreachable or failed to scan; the game list may be partial. */
  complete: boolean;
  /** Launcher collections (Steam Favorites, user collections), merged across installs. */
  collections: GameCollection[];
  /** Games hidden in their launcher (e.g. Steam's Hidden collection). */
  hiddenInLauncher: Set<string>;
  /**
   * True only when every install was scanned and every launcher's hidden list was read, so
   * `hiddenInLauncher` is authoritative (safe to forget overrides for games no longer in it).
   */
  hiddenInLauncherComplete: boolean;
  /** A preference that couldn't be used (e.g. a Steam Directory that isn't a Steam install). Worth telling the user. */
  settingsProblem?: string;
}

/** Scan every supported launcher and return one sorted, de-duplicated list. */
export function scanLibrary(options: LibraryOptions = {}): LibraryScan {
  const warnings: string[] = [];
  const sources: string[] = [];
  const byId = new Map<string, Game>();
  const installedSteamAppids = new Set<number>();
  const collections = new Map<string, GameCollection>();
  const hiddenInLauncher = new Set<string>();
  let collectionsComplete = true;
  let complete = true;

  const appInfo = options.appInfoCachePath ? AppInfoStore.load(options.appInfoCachePath) : AppInfoStore.memory();
  const installs = findSteamInstalls({ override: options.steamPath, home: options.home });
  // With nothing found we can't tell "no games" from "wrong path", so never treat the result as authoritative.
  if (installs.length === 0) complete = false;
  let settingsProblem: string | undefined;
  if (options.steamPath?.trim() && installs.length === 0) {
    settingsProblem = `The Steam Directory setting doesn't point at a Steam install (no steamapps folder): ${options.steamPath.trim()}`;
  }
  for (const install of installs) {
    sources.push(`Steam (${install.kind}): ${install.root}`);
    try {
      const result = scanSteamInstall(install, { includeTools: options.includeNonGames, appInfo });
      warnings.push(...result.warnings);
      complete &&= result.complete;
      for (const id of result.installedAppids) installedSteamAppids.add(id);
      for (const g of result.games) if (!byId.has(g.id)) byId.set(g.id, g);
      for (const id of result.hiddenInLauncher) hiddenInLauncher.add(id);
      collectionsComplete &&= result.collectionsComplete;
      for (const c of result.collections) {
        const prev = collections.get(c.id);
        collections.set(c.id, prev ? { ...prev, gameIds: new Set([...prev.gameIds, ...c.gameIds]) } : c);
      }
    } catch (err) {
      complete = false;
      warnings.push(`Failed to scan Steam at ${install.root}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Only forget uninstalled apps when we know the full picture (not with an unmounted library drive).
  if (complete) appInfo.retain(installedSteamAppids);
  appInfo.save();

  return {
    games: [...byId.values()].sort(compareGames),
    warnings,
    sources,
    installedSteamAppids,
    complete,
    settingsProblem,
    // Favorites first, then user collections in the order the launcher scan sorted them.
    collections: [...collections.values()].sort((a, b) => Number(b.kind === "favorites") - Number(a.kind === "favorites")),
    hiddenInLauncher,
    hiddenInLauncherComplete: complete && collectionsComplete,
  };
}

export interface EmptyStateText {
  title: string;
  description: string;
}

/** What to tell the user when the scan found no games. */
export function emptyStateText(scan: LibraryScan): EmptyStateText {
  if (scan.sources.length === 0) {
    return {
      title: "No Steam install found",
      description: scan.settingsProblem
        ? `${scan.settingsProblem}. Fix it in Settings (Ctrl+,).`
        : "Looked in the usual native, Flatpak and Snap locations. If Steam is installed somewhere else, set the Steam Directory in Settings (Ctrl+,).",
    };
  }
  const lines = [`Looked in:`, ...scan.sources.map((s) => `• ${s}`)];
  if (scan.settingsProblem) lines.push("", scan.settingsProblem);
  if (scan.warnings.length) lines.push("", ...scan.warnings);
  return { title: "No games found", description: lines.join("\n") };
}
