/** Which artwork to cache for which games. Pure, so it can be unit-tested without Vicinae. */
import type { ArtworkRequest, CachedKind } from "./artwork-cache";
import type { Game } from "./games";
import type { ViewSettings } from "./view-settings";

/** Which cached artwork kinds the current layout actually displays. */
export function neededKinds(settings: ViewSettings): CachedKind[] {
  if (settings.layout === "grid") {
    if (settings.artwork === "cover") return ["portrait"];
    if (settings.artwork === "banner") return ["header"];
    return []; // hero and logo are already full resolution in Steam's local cache
  }
  // Lists: the row icon plus the banner shown in the details pane.
  return ["icon", "header"];
}

/** The cache request for a game's artwork kind, or undefined when there's nothing to fetch. */
export function requestFor(game: Game, kind: CachedKind): ArtworkRequest | undefined {
  if (!game.steam) return undefined;
  // The user's own custom art always wins, so a download would never be shown.
  if (game.customArtwork?.[kind]) return undefined;
  return {
    appid: game.steam.appid,
    kind,
    hasLocal: Boolean(game.artwork[kind]),
    clientIcon: game.steam.clientIcon,
    localIco: game.steam.localIco,
  };
}
