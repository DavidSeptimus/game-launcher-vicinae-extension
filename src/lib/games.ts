/**
 * Launcher-agnostic game model. Each launcher integration (Steam, Lutris, ...)
 * produces `Game`s, and the UI only uses this type.
 */

export type GameSource = "steam" | "lutris";

export const LAUNCHER_NAMES: Record<GameSource, string> = { steam: "Steam", lutris: "Lutris" };

/**
 * When the same game is installed through several launchers and duplicates are
 * hidden, the copy from the launcher listed first wins.
 */
export const LAUNCHER_PRECEDENCE: readonly GameSource[] = ["steam", "lutris"];

export interface GameArtwork {
  /** 2:3 cover art (the Steam library capsule). */
  portrait?: string;
  /** Landscape header / banner. */
  header?: string;
  hero?: string;
  logo?: string;
  /** Small square icon. */
  icon?: string;
}

export interface Game {
  /** Globally unique and stable, e.g. "steam:1145350". Used for hiding games and as the React key. */
  id: string;
  source: GameSource;
  title: string;
  /** URI that launches the game, e.g. steam://rungameid/1145350. */
  launchUri: string;
  installDir?: string;
  sizeOnDisk?: number;
  /** Unix seconds; 0 when never played or unknown. */
  lastPlayed: number;
  playtimeMinutes?: number;
  /** Artwork found locally: custom art where the user set it, else the launcher's own cache (Steam: 1x resolution). */
  artwork: GameArtwork;
  /** User-chosen custom art (Steam: userdata/<id>/config/grid). Always wins over downloaded art. */
  customArtwork?: GameArtwork;
  /** Extra search terms (acronyms, app ids, install dir names). */
  keywords: string[];
  /**
   * Store identities, used to spot the same game in several launchers, e.g. ["steam:1145350"] for a
   * Steam game, or ["gog:1207658901"] for a GOG game installed through Lutris.
   */
  storeIds: string[];
  steam?: {
    appid: number;
    /** Lower-cased appinfo type ("game", "tool", ...), when known. */
    type?: string;
    isTool: boolean;
    /** appinfo clienticon hash: the multi-resolution .ico on Steam's CDN. */
    clientIcon?: string;
    /** Local copy of that .ico, if Steam has cached one (steam/games/<hash>.ico). */
    localIco?: string;
  };
  lutris?: {
    id: number;
    slug: string;
    /** Lutris runner, e.g. "wine", "dosbox", "steam". */
    runner?: string;
    platform?: string;
    /** Store the game came from via a Lutris service, e.g. "gog", "egs", "steam". */
    service?: string;
  };
}

/** What one launcher integration found. */
export interface LauncherScan {
  launcher: GameSource;
  /** An install of the launcher was found. */
  found: boolean;
  /** Where we looked / what we found, for the empty state. */
  sources: string[];
  games: Game[];
  collections: GameCollection[];
  /** Games hidden in the launcher itself (e.g. Steam's Hidden collection, Lutris's ".hidden" category). */
  hiddenInLauncher: Set<string>;
  /** False if the launcher's hidden list couldn't be read completely, so it can't be trusted for pruning. */
  hiddenListComplete: boolean;
  /** False if part of the launcher's library couldn't be scanned (e.g. an unmounted drive). */
  complete: boolean;
  warnings: string[];
  /** A preference for this launcher that couldn't be used. */
  settingsProblem?: string;
}

/** A launcher-defined group of games (e.g. Steam Favorites or a user collection). */
export interface GameCollection {
  /** Unique across launchers, e.g. "steam:favorite" or "steam:uc-abc". */
  id: string;
  name: string;
  source: GameSource;
  kind: "favorites" | "user";
  /** Game ids (e.g. "steam:1145350"); may include games that aren't installed. */
  gameIds: Set<string>;
}

/** Most recently played first, then alphabetical. */
export function compareGames(a: Game, b: Game): number {
  if (a.lastPlayed !== b.lastPlayed) return b.lastPlayed - a.lastPlayed;
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
}

/**
 * Acronym used as a search keyword: "Kingdom Come: Deliverance II" -> "kcdii", "kcd".
 * Lets people type the abbreviations gamers actually use.
 */
export function acronyms(title: string): string[] {
  const words = title
    .replace(/[™®©]/g, "")
    .split(/[\s:\-–—_.,/&+]+/)
    .filter(Boolean);
  if (words.length < 2) return [];
  const isRoman = (w: string) => /^[IVX]+$/.test(w);
  const isNumber = (w: string) => /^\d+$/.test(w);
  const letters = words.map((w) => (isRoman(w) || isNumber(w) ? w : w[0]!)).join("");
  const core = words
    .filter((w) => !isRoman(w) && !isNumber(w))
    .map((w) => w[0]!)
    .join("");
  const out = new Set([letters.toLowerCase(), core.toLowerCase()]);
  return [...out].filter((a) => a.length >= 2);
}
