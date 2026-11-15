import { ActionPanel, environment, getPreferenceValues, Grid, Icon, List, showToast, Toast } from "@vicinae/api";
import { join } from "node:path";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SettingsAction } from "./components/game-actions";
import { GameGrid, type GameViewProps } from "./components/game-grid";
import { GameList } from "./components/game-list";
import { useHiresArtwork } from "./hooks/use-hires-artwork";
import { confirmAndClearArtworkCache } from "./lib/clear-artwork";
import {
  applyFilter,
  collectionNamesFor,
  collectionOptions,
  type GameFilter,
  hiddenGameIds,
  resolveFilter,
} from "./lib/game-views";
import type { Game } from "./lib/games";
import { loadHiddenState, saveHiddenState } from "./lib/hidden";
import { emptyStateText, type LibraryScan, scanLibrary } from "./lib/library";
import { resolveViewSettings } from "./lib/view-settings";
import { emptyHiddenState, type HiddenState, pruneShown, toggleHidden } from "./lib/visibility";

export default function SearchGames() {
  // Preferences.SearchGames is generated from package.json into vicinae-env.d.ts by `vici`.
  const prefs = getPreferenceValues<Preferences.SearchGames>();
  const settings = useMemo(
    () => resolveViewSettings(prefs),
    [prefs.layout, prefs.artwork, prefs.gridSize, prefs.labels],
  );

  const [scan, setScan] = useState<LibraryScan | undefined>();
  const [hiddenState, setHiddenState] = useState<HiddenState | undefined>();
  // If the saved hidden lists couldn't be loaded, never save: that would overwrite them with an empty list.
  const [hiddenLoadFailed, setHiddenLoadFailed] = useState(false);
  const [filter, setFilter] = useState<GameFilter>("visible");

  // Vicinae unloads the command when its window closes, so every open starts with a fresh scan
  // (and changing a preference re-runs it). There's no manual refresh: nothing to refresh between opens.
  const runScan = useCallback(() => {
    const result = scanLibrary({
      steamPath: prefs.steamPath,
      includeNonGames: prefs.includeNonGames,
      appInfoCachePath: join(environment.supportPath, "appinfo-cache.json"),
    });
    // A bad Steam Directory setting means nothing is scanned, so the empty state explains it (no toast needed).
    for (const w of result.warnings) console.warn(w);
    setScan(result);
  }, [prefs.steamPath, prefs.includeNonGames]);

  useEffect(() => {
    // Defer so the loading state renders before the synchronous filesystem scan.
    const timer = setTimeout(runScan, 0);
    loadHiddenState().then(
      (state) => {
        setHiddenLoadFailed(false);
        setHiddenState(state);
      },
      (err) => {
        console.warn("Couldn't load hidden games", err);
        setHiddenLoadFailed(true);
        setHiddenState(emptyHiddenState());
      },
    );
    return () => clearTimeout(timer);
  }, [runScan]);

  // Forget "show anyway" overrides for games Steam no longer hides — but only when Steam's hidden
  // list was read completely; a failed or partial read would otherwise wipe the overrides.
  useEffect(() => {
    if (!scan || !hiddenState || hiddenLoadFailed || !scan.hiddenInLauncherComplete) return;
    const pruned = pruneShown(hiddenState, scan.hiddenInLauncher);
    if (pruned) {
      setHiddenState(pruned);
      // Best effort: if this fails, the same overrides are simply pruned again next time.
      saveHiddenState(pruned).catch((err) => console.warn("Couldn't save hidden games", err));
    }
  }, [scan, hiddenState, hiddenLoadFailed]);

  const onToggleHidden = useCallback(
    async (game: Game) => {
      if (!scan || !hiddenState) return;
      if (hiddenLoadFailed) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Can't change hidden games right now",
          message: "Your hidden games couldn't be loaded. Reopen the command to try again.",
        });
        return;
      }
      const result = toggleHidden(game.id, hiddenState, scan.hiddenInLauncher);
      setHiddenState(result.state);
      try {
        await saveHiddenState(result.state);
      } catch (err) {
        // Don't show a change that won't survive a reopen.
        setHiddenState(hiddenState);
        await showToast({
          style: Toast.Style.Failure,
          title: `Couldn't ${result.nowHidden ? "hide" : "unhide"} ${game.title}`,
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      await showToast({
        style: Toast.Style.Success,
        title: result.nowHidden ? `Hid ${game.title}` : `Unhid ${game.title}`,
        message: result.stillHiddenInLauncher ? "Shown here, but still hidden in Steam" : undefined,
      });
    },
    [scan, hiddenState, hiddenLoadFailed],
  );

  const hidden = useMemo(
    () => (scan && hiddenState ? hiddenGameIds(scan, hiddenState) : new Set<string>()),
    [scan, hiddenState],
  );
  const collections = useMemo(() => (scan ? collectionOptions(scan, hidden) : []), [scan, hidden]);
  const activeFilter = resolveFilter(filter, collections);
  const games = useMemo(
    () => (scan && hiddenState ? applyFilter(scan, hidden, activeFilter) : []),
    [scan, hiddenState, hidden, activeFilter],
  );
  const collectionNames = useCallback((gameId: string) => (scan ? collectionNamesFor(scan, gameId) : []), [scan]);

  const artworkSource = prefs.artworkSource === "local" ? "local" : "hires";
  const { art: hires, usage, clearCache } = useHiresArtwork(scan, settings, artworkSource);
  const onClearCache = useCallback(() => {
    void confirmAndClearArtworkCache(usage(), clearCache, { redownload: artworkSource === "hires" });
  }, [usage, clearCache, artworkSource]);

  const isLoading = !scan || !hiddenState;
  const isGrid = settings.layout === "grid";
  // Grid and List expose identically-shaped Dropdown/EmptyView components, but each view must use its own.
  const Dropdown = isGrid ? Grid.Dropdown : List.Dropdown;
  const EmptyView = isGrid ? Grid.EmptyView : List.EmptyView;

  const empty =
    activeFilter === "hidden"
      ? { title: "No hidden games", description: "Games hidden here or in Steam show up in this list." }
      : activeFilter !== "visible"
        ? { title: "No games in this collection", description: "None of this collection's games are installed." }
        : scan
          ? emptyStateText(scan)
          : undefined;

  const viewProps: GameViewProps = {
    games,
    hidden,
    isLoading,
    hires,
    settings,
    collectionNames,
    onToggleHidden,
    onClearCache,
    searchBarAccessory: (
      <Dropdown tooltip="Show" value={activeFilter} onChange={(v) => setFilter(v as GameFilter)}>
        <Dropdown.Item title="Installed Games" value="visible" icon={Icon.GameController} />
        <Dropdown.Item title={`Hidden Games (${hidden.size})`} value="hidden" icon={Icon.EyeDisabled} />
        {collections.length > 0 && (
          <Dropdown.Section title="Steam">
            {collections.map((o) => (
              <Dropdown.Item
                key={o.value}
                title={`${o.collection.name} (${o.count})`}
                value={o.value}
                icon={o.collection.kind === "favorites" ? Icon.Star : Icon.Folder}
              />
            ))}
          </Dropdown.Section>
        )}
      </Dropdown>
    ),
    emptyView: (
      <EmptyView
        icon={Icon.GameController}
        title={empty?.title}
        description={empty?.description}
        actions={
          <ActionPanel>
            <SettingsAction />
          </ActionPanel>
        }
      />
    ),
  };

  return isGrid ? (
    <GameGrid {...viewProps} />
  ) : (
    <GameList {...viewProps} initialShowDetail={settings.layout === "list-detail"} />
  );
}
