/** The dropdown views (installed / hidden / launcher collections). Pure, so it can be unit-tested. */
import type { Game, GameCollection } from "./games";
import type { LibraryScan } from "./library";
import { type HiddenState, isHidden } from "./visibility";

export type GameFilter = "visible" | "hidden" | `collection:${string}`;

export interface CollectionOption {
  value: GameFilter;
  collection: GameCollection;
  /** Visible installed games in the collection. */
  count: number;
}

/** Ids of every hidden installed game (ours and the launcher's, minus "shown" overrides). */
export function hiddenGameIds(scan: LibraryScan, state: HiddenState): Set<string> {
  return new Set(scan.games.filter((g) => isHidden(g.id, state, scan.hiddenInLauncher)).map((g) => g.id));
}

/** Collections worth offering: those with at least one visible installed game. */
export function collectionOptions(scan: LibraryScan, hidden: ReadonlySet<string>): CollectionOption[] {
  const options: CollectionOption[] = [];
  for (const collection of scan.collections) {
    const count = scan.games.filter((g) => collection.gameIds.has(g.id) && !hidden.has(g.id)).length;
    if (count > 0) options.push({ value: `collection:${collection.id}`, collection, count });
  }
  return options;
}

/** Fall back to all games if the selected collection is no longer offered (e.g. its last game was hidden). */
export function resolveFilter(filter: GameFilter, options: readonly CollectionOption[]): GameFilter {
  if (!filter.startsWith("collection:")) return filter;
  return options.some((o) => o.value === filter) ? filter : "visible";
}

export function applyFilter(scan: LibraryScan, hidden: ReadonlySet<string>, filter: GameFilter): Game[] {
  if (filter === "hidden") return scan.games.filter((g) => hidden.has(g.id));
  const visible = scan.games.filter((g) => !hidden.has(g.id));
  if (filter === "visible") return visible;
  const id = filter.slice("collection:".length);
  const collection = scan.collections.find((c) => c.id === id);
  return collection ? visible.filter((g) => collection.gameIds.has(g.id)) : visible;
}

/** Names of the collections a game belongs to, for the details pane. */
export function collectionNamesFor(scan: LibraryScan, gameId: string): string[] {
  return scan.collections.filter((c) => c.gameIds.has(gameId)).map((c) => c.name);
}
