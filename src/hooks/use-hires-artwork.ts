import { useCallback, useEffect, useMemo, useState } from "react";
import { type ArtworkRequest, type CachedKind, forEachLimit } from "../lib/artwork-cache";
import { neededKinds, requestFor } from "../lib/artwork-requests";
import { type ArtworkSource, openArtworkCache } from "../lib/artwork-location";
import type { Game, GameArtwork } from "../lib/games";
import type { LibraryScan } from "../lib/library";
import type { ViewSettings } from "../lib/view-settings";

const CONCURRENCY = 6;
const FLUSH_MS = 150;

function setArt(map: Map<string, GameArtwork>, gameId: string, kind: CachedKind, path: string) {
  map.set(gameId, { ...map.get(gameId), [kind]: path });
}

export interface HiresArtwork {
  /** Cached high-resolution artwork, keyed by game id. */
  art: ReadonlyMap<string, GameArtwork>;
  /** Delete the whole cache. With downloads enabled, current art is re-fetched afterwards. */
  clearCache: () => { files: number; bytes: number };
}

/**
 * High-resolution artwork for the scanned games. Returns what's already cached
 * immediately, then downloads anything missing in the background and
 * re-renders as files arrive. Also prunes art for uninstalled games once per
 * complete scan.
 */
export function useHiresArtwork(scan: LibraryScan | undefined, settings: ViewSettings, source: ArtworkSource): HiresArtwork {
  const games = useMemo(() => scan?.games ?? [], [scan]);
  const kinds = neededKinds(settings);
  const kindsKey = kinds.join(",");
  const cache = useMemo(() => openArtworkCache(source), [source]);
  // Bumped after clearing the cache, to re-read it and restart downloads.
  const [generation, setGeneration] = useState(0);

  // Prune before reading so the first render never points at files about to be deleted.
  useMemo(() => {
    if (scan?.complete) cache.prune(scan.installedSteamAppids);
  }, [scan, cache]);

  // Whatever is already on disk, so the first render is sharp when the cache is warm.
  const initial = useMemo(() => {
    const map = new Map<string, GameArtwork>();
    for (const game of games) {
      for (const kind of kinds) {
        const req = requestFor(game, kind);
        if (!req) continue;
        // In local-only mode, only use icons extracted from Steam's own local .ico files.
        if (source === "local" && !(kind === "icon" && req.localIco)) continue;
        const path = cache.get(req.appid, kind, req.hasLocal);
        if (path) setArt(map, game.id, kind, path);
      }
    }
    return map;
  }, [games, kindsKey, cache, source, generation]);

  const [art, setArtState] = useState(initial);
  useEffect(() => setArtState(initial), [initial]);

  useEffect(() => {
    const jobs: { game: Game; req: ArtworkRequest }[] = [];
    for (const game of games) {
      for (const kind of kinds) {
        const req = requestFor(game, kind);
        if (req && cache.needsFetch(req)) jobs.push({ game, req });
      }
    }
    if (jobs.length === 0) return;

    let cancelled = false;
    let pending: { gameId: string; kind: CachedKind; path: string }[] = [];
    const flush = () => {
      if (cancelled || pending.length === 0) return;
      const batch = pending;
      pending = [];
      setArtState((prev) => {
        const next = new Map(prev);
        for (const p of batch) setArt(next, p.gameId, p.kind, p.path);
        return next;
      });
    };
    const timer = setInterval(flush, FLUSH_MS);

    forEachLimit(jobs, CONCURRENCY, async ({ game, req }) => {
      if (cancelled) return;
      const path = await cache.ensure(req);
      if (path) pending.push({ gameId: game.id, kind: req.kind, path });
    })
      .catch((err) => console.warn("Artwork download failed", err))
      .finally(() => {
        flush();
        clearInterval(timer);
      });

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [games, kindsKey, cache, generation]);

  const clearCache = useCallback(() => {
    const freed = cache.clear();
    setArtState(new Map());
    setGeneration((g) => g + 1);
    return freed;
  }, [cache]);

  return { art, clearCache };
}
