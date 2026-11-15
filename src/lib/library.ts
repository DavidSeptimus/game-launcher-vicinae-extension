import {
  compareGames,
  type Game,
  type GameCollection,
  type GameSource,
  LAUNCHER_NAMES,
  LAUNCHER_PRECEDENCE,
  type LauncherScan,
} from "./games";
import { scanLutris } from "./lutris/scan";
import { scanSteam } from "./steam/scan";

export interface LibraryOptions {
  /** Launchers to scan (default: all). A disabled launcher isn't touched at all. */
  enabledLaunchers?: readonly GameSource[];
  steamPath?: string;
  includeNonGames?: boolean;
  lutrisPath?: string;
  /** Show a game installed through several launchers only once, from the highest-precedence launcher. */
  hideDuplicates?: boolean;
  /** Where to persist appinfo.vdf lookups between runs. Without it, appinfo.vdf is read on every scan. */
  appInfoCachePath?: string;
  /** Home directory to auto-detect launchers in (tests). Defaults to the real one. */
  home?: string;
}

export interface LibraryScan {
  /** Every installed game (hidden ones included), duplicates removed if requested, most recently played first. */
  games: Game[];
  /** Per enabled launcher, in precedence order. */
  launchers: LauncherScan[];
  enabledLaunchers: GameSource[];
  warnings: string[];
  /** Where we looked / what we found, for the empty state. */
  sources: string[];
  /** Preferences that couldn't be used (e.g. a Steam Directory that isn't a Steam install). */
  settingsProblems: string[];
  /** Launcher collections (Favorites, user collections), in launcher precedence order. */
  collections: GameCollection[];
  /** Games hidden in their own launcher (Steam's Hidden collection, Lutris's ".hidden" category). */
  hiddenInLauncher: Set<string>;
  /**
   * Launchers whose hidden list was read completely this scan. Only for these is it safe to forget
   * "shown here" overrides for games the launcher no longer hides.
   */
  hiddenListsComplete: Set<GameSource>;
  /** Installed Steam app ids (tools and apps mid-update included), for pruning Steam-keyed caches. */
  installedSteamAppids: Set<number>;
  /** Steam was enabled and fully scanned: safe to prune Steam-keyed caches. */
  steamComplete: boolean;
  /** Games left out because a higher-precedence launcher has the same game. */
  duplicatesHidden: number;
}

export interface DedupeResult {
  games: Game[];
  /** Hidden duplicate id -> id of the copy that's shown. */
  aliases: Map<string, string>;
}

/**
 * Drop games that a higher-precedence launcher also has, matched by store id
 * (e.g. a Steam game Lutris imported has "steam:<appid>", like Steam's own copy).
 */
export function dedupeByPrecedence(
  games: readonly Game[],
  precedence: readonly GameSource[] = LAUNCHER_PRECEDENCE,
): DedupeResult {
  const rank = (g: Game) => {
    const i = precedence.indexOf(g.source);
    return i === -1 ? precedence.length : i;
  };
  const ordered = [...games].sort((a, b) => rank(a) - rank(b));
  const claimed = new Map<string, string>(); // store id -> winning game id
  const kept: Game[] = [];
  const aliases = new Map<string, string>();
  for (const game of ordered) {
    const winner = game.storeIds.map((id) => claimed.get(id)).find((id) => id !== undefined);
    if (winner) {
      aliases.set(game.id, winner);
      continue;
    }
    kept.push(game);
    for (const id of game.storeIds) claimed.set(id, game.id);
  }
  return { games: kept, aliases };
}

/** Scan every enabled launcher and return one sorted list. */
export function scanLibrary(options: LibraryOptions = {}): LibraryScan {
  const enabled = LAUNCHER_PRECEDENCE.filter((l) => !options.enabledLaunchers || options.enabledLaunchers.includes(l));
  const launchers: LauncherScan[] = [];
  let installedSteamAppids = new Set<number>();
  let steamComplete = false;

  for (const launcher of enabled) {
    if (launcher === "steam") {
      const steam = scanSteam({
        steamPath: options.steamPath,
        includeTools: options.includeNonGames,
        appInfoCachePath: options.appInfoCachePath,
        home: options.home,
      });
      installedSteamAppids = steam.installedAppids;
      steamComplete = steam.complete;
      launchers.push(steam);
    } else if (launcher === "lutris") {
      launchers.push(scanLutris({ lutrisPath: options.lutrisPath, home: options.home }));
    }
  }

  const all = launchers.flatMap((l) => l.games);
  const { games, aliases } =
    options.hideDuplicates === false ? { games: all, aliases: new Map<string, string>() } : dedupeByPrecedence(all);

  // A hidden duplicate's collection memberships carry over to the copy that's shown,
  // so e.g. a Lutris favorite that's also a Steam game still appears in Lutris > Favorites.
  const collections = launchers.flatMap((l) =>
    l.collections.map((c) => ({ ...c, gameIds: new Set([...c.gameIds].map((id) => aliases.get(id) ?? id)) })),
  );

  return {
    games: games.sort(compareGames),
    launchers,
    enabledLaunchers: enabled,
    warnings: launchers.flatMap((l) => l.warnings),
    sources: launchers.flatMap((l) => l.sources),
    settingsProblems: launchers.flatMap((l) => (l.settingsProblem ? [l.settingsProblem] : [])),
    collections,
    hiddenInLauncher: new Set(launchers.flatMap((l) => [...l.hiddenInLauncher])),
    hiddenListsComplete: new Set(launchers.filter((l) => l.hiddenListComplete).map((l) => l.launcher)),
    installedSteamAppids,
    steamComplete,
    duplicatesHidden: aliases.size,
  };
}

export interface EmptyStateText {
  title: string;
  description: string;
}

const NOT_FOUND_HINT: Record<GameSource, string> = {
  steam: "not found in the usual native, Flatpak and Snap locations",
  lutris: "not found in the usual native and Flatpak locations",
};

/** What to tell the user when the scan found no games. */
export function emptyStateText(scan: LibraryScan): EmptyStateText {
  if (scan.enabledLaunchers.length === 0) {
    return { title: "All launchers are turned off", description: "Turn on Steam or Lutris in Settings (Ctrl+,)." };
  }
  if (!scan.launchers.some((l) => l.found)) {
    const lines = scan.launchers.map(
      (l) => l.settingsProblem ?? `${LAUNCHER_NAMES[l.launcher]}: ${NOT_FOUND_HINT[l.launcher]}.`,
    );
    lines.push(
      "",
      scan.settingsProblems.length
        ? "Fix it in Settings (Ctrl+,)."
        : "If a launcher is installed somewhere else, set its folder in Settings (Ctrl+,).",
    );
    const only = scan.launchers.length === 1 ? scan.launchers[0] : undefined;
    return {
      title: only ? `No ${LAUNCHER_NAMES[only.launcher]} install found` : "No game launchers found",
      description: lines.join("\n"),
    };
  }
  const lines = ["Looked in:", ...scan.sources.map((s) => `• ${s}`)];
  if (scan.settingsProblems.length) lines.push("", ...scan.settingsProblems);
  if (scan.warnings.length) lines.push("", ...scan.warnings);
  return { title: "No games found", description: lines.join("\n") };
}
