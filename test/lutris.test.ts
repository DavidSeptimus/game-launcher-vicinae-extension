import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFilter, collectionOptions, launcherOptions, resolveFilter } from "../src/lib/game-views";
import { copiesOf, type Game, launchersOf } from "../src/lib/games";
import { mergeByPriority, mergeCopies, scanLibrary } from "../src/lib/library";
import { isDefaultPriority, loadPriority, moveLauncher, normalizePriority, savePriority } from "../src/lib/launcher-priority";
import { findLutrisInstalls } from "../src/lib/lutris/paths";
import { scanLutris, steamAppIdFromConfig, storeIdsFor } from "../src/lib/lutris/scan";
import { manifest, makeTempDir, writeFile } from "./fixtures/fake-steam";
import { lutrisArt, makeLutrisDb } from "./fixtures/fake-lutris";

function nativeLutris(home: string) {
  const dataDir = join(home, ".local/share/lutris");
  const iconDir = join(home, ".local/share/icons/hicolor/128x128/apps");
  return { dataDir, iconDir };
}

describe("findLutrisInstalls", () => {
  it("finds native and Flatpak installs by their pga.db", () => {
    const home = makeTempDir();
    makeLutrisDb(join(home, ".local/share/lutris"), []);
    makeLutrisDb(join(home, ".var/app/net.lutris.Lutris/data/lutris"), []);
    const installs = findLutrisInstalls({ home });
    expect(installs.map((i) => i.kind)).toEqual(["native", "flatpak"]);
    expect(installs[1]?.iconDir).toBe(join(home, ".var/app/net.lutris.Lutris/data/icons/hicolor/128x128/apps"));
  });

  it("uses only the override when set", () => {
    const home = makeTempDir();
    makeLutrisDb(join(home, ".local/share/lutris"), []);
    const custom = makeTempDir();
    makeLutrisDb(custom, []);
    expect(findLutrisInstalls({ home, override: custom }).map((i) => i.kind)).toEqual(["custom"]);
    expect(findLutrisInstalls({ home, override: join(custom, "nope") })).toEqual([]);
  });
});

describe("scanLutris", () => {
  it("reads installed games with play data, artwork and store ids", () => {
    const home = makeTempDir();
    const { dataDir, iconDir } = nativeLutris(home);
    makeLutrisDb(dataDir, [
      {
        id: 1,
        name: "Tyrian 2000",
        slug: "tyrian-2000",
        runner: "dosbox",
        platform: "MS-DOS",
        directory: "/home/u/Games/gog/tyrian-2000",
        lastplayed: 1794727450,
        playtime: 1.5,
        service: "gog",
        service_id: "1207658901",
      },
      { id: 2, name: "Not Installed", slug: "not-installed", installed: 0 },
      { id: 3, name: "Manual Game", slug: "manual-game", runner: "linux" },
    ]);
    lutrisArt(dataDir, iconDir, "tyrian-2000", ["cover", "banner", "icon"]);

    const result = scanLutris({ home });
    expect(result).toMatchObject({ found: true, complete: true, hiddenListComplete: true, warnings: [] });
    expect(result.games.map((g) => g.title)).toEqual(["Tyrian 2000", "Manual Game"]);
    expect(result.games[0]).toMatchObject({
      id: "lutris:1",
      source: "lutris",
      launchUri: "lutris:rungameid/1",
      installDir: "/home/u/Games/gog/tyrian-2000",
      lastPlayed: 1794727450,
      playtimeMinutes: 90,
      storeIds: ["gog:1207658901"],
      lutris: { id: 1, slug: "tyrian-2000", runner: "dosbox", platform: "MS-DOS", service: "gog" },
      artwork: {
        portrait: join(dataDir, "coverart/tyrian-2000.jpg"),
        header: join(dataDir, "banners/tyrian-2000.jpg"),
        icon: join(iconDir, "lutris_tyrian-2000.png"),
      },
    });
    expect(result.games[0]?.keywords).toEqual(expect.arrayContaining(["t2000", "tyrian-2000", "dosbox", "gog"]));
    expect(result.games[1]).toMatchObject({ lastPlayed: 0, playtimeMinutes: undefined, storeIds: [], artwork: {} });
  });

  it("maps categories to favorites, hidden and user collections", () => {
    const home = makeTempDir();
    makeLutrisDb(nativeLutris(home).dataDir, [
      { id: 1, name: "A", slug: "a", categories: ["favorite", "Retro"] },
      { id: 2, name: "B", slug: "b", categories: [".hidden"] },
      { id: 3, name: "C", slug: "c", categories: ["Retro", ".uninstalled"] },
    ]);
    const result = scanLutris({ home });
    expect(result.hiddenInLauncher).toEqual(new Set(["lutris:2"]));
    expect(result.collections).toEqual([
      { id: "lutris:favorite", name: "Favorites", source: "lutris", kind: "favorites", gameIds: new Set(["lutris:1"]) },
      { id: "lutris:category:Retro", name: "Retro", source: "lutris", kind: "user", gameIds: new Set(["lutris:1", "lutris:3"]) },
    ]);
  });

  it("copes with databases that have no categories tables", () => {
    const home = makeTempDir();
    makeLutrisDb(nativeLutris(home).dataDir, [{ id: 1, name: "A", slug: "a" }], { categoriesTables: false });
    expect(scanLutris({ home }).games).toHaveLength(1);
  });

  it("reports an unreadable database without trusting its (empty) hidden list", () => {
    const home = makeTempDir();
    writeFile(join(nativeLutris(home).dataDir, "pga.db"), "not a database");
    const result = scanLutris({ home });
    expect(result).toMatchObject({ found: true, complete: false, hiddenListComplete: false, games: [] });
    expect(result.warnings[0]).toMatch(/^Couldn't read Lutris's game database/);
  });

  it("explains a bad Lutris Folder setting", () => {
    const result = scanLutris({ home: makeTempDir(), lutrisPath: "/nope" });
    expect(result.found).toBe(false);
    expect(result.settingsProblem).toMatch(/Lutris Folder setting doesn't point at a Lutris data folder.*\/nope$/);
  });

  it("reads the Steam app id from configs of Steam-runner games added without a service", () => {
    const home = makeTempDir();
    const { dataDir } = nativeLutris(home);
    makeLutrisDb(dataDir, [
      { id: 2, name: "Wartales", slug: "wartales", runner: "steam", configpath: "wartales-1794728405" },
      { id: 3, name: "Elsewhere", slug: "elsewhere", runner: "steam", configpath: "elsewhere-1" },
      { id: 4, name: "No Config", slug: "no-config", runner: "steam", configpath: "missing-1" },
    ]);
    // Lutris writes to ~/.config/lutris/games when that dir exists, else <data dir>/games: both are read.
    writeFile(join(home, ".config/lutris/games/wartales-1794728405.yml"), "game:\n  appid: '1527950'\n  args: ''\nsystem:\n  gamescope: true\n");
    writeFile(join(dataDir, "games/elsewhere-1.yml"), "game:\n  appid: 42\n");
    expect(scanLutris({ home }).games.map((g) => [g.title, g.storeIds])).toEqual([
      ["Wartales", ["steam:1527950"]],
      ["Elsewhere", ["steam:42"]],
      ["No Config", []],
    ]);
  });

  it.each([
    ["game:\n  appid: '1527950'\n", "1527950"],
    ['game:\n  appid: "7"  # comment\n', "7"],
    ["game:\r\n  args: ''\r\n  appid: 99\r\n", "99"],
    ["system:\n  appid: 5\ngame:\n  args: x\n", undefined],
    ["game:\n  appid: 'abc'\n", undefined],
    ["", undefined],
  ])("steamAppIdFromConfig(%j) -> %j", (yaml, expected) => {
    expect(steamAppIdFromConfig(yaml)).toBe(expected);
  });

  it("builds store ids from the service", () => {
    expect(storeIdsFor({ service: "steam", service_id: "1145350" })).toEqual(["steam:1145350"]);
    expect(storeIdsFor({ service: "gog", service_id: "1" }, "730")).toEqual(["gog:1", "steam:730"]);
    expect(storeIdsFor({ service: "steam", service_id: "730" }, "730")).toEqual(["steam:730"]);
    expect(storeIdsFor({ service: " GOG ", service_id: "12" })).toEqual(["gog:12"]);
    expect(storeIdsFor({ service: null, service_id: "12" })).toEqual([]);
  });
});

describe("Steam + Lutris", () => {
  /**
   * A home with Steam (Hades II, Wartales) and Lutris: Hades II via Lutris's Steam service,
   * Wartales added by hand with the Steam runner (app id only in its config), and a GOG game.
   */
  function bothLaunchers() {
    const home = makeTempDir();
    const steam = join(home, ".local/share/Steam");
    writeFile(join(steam, "steamapps/appmanifest_1145350.acf"), manifest({ appid: 1145350, name: "Hades II", installdir: "Hades II" }));
    writeFile(join(steam, "steamapps/appmanifest_1527950.acf"), manifest({ appid: 1527950, name: "Wartales", installdir: "Wartales" }));
    const { dataDir } = nativeLutris(home);
    makeLutrisDb(dataDir, [
      { id: 1, name: "Tyrian 2000", slug: "tyrian-2000", service: "gog", service_id: "1207658901" },
      { id: 2, name: "Hades II", slug: "hades-ii", runner: "steam", service: "steam", service_id: "1145350", categories: ["favorite"] },
      { id: 3, name: "Wartales", slug: "wartales", runner: "steam", configpath: "wartales-1" },
    ]);
    writeFile(join(dataDir, "games/wartales-1.yml"), "game:\n  appid: '1527950'\n");
    return home;
  }

  it("shows a game in several launchers as one entry, opened with the preferred launcher", () => {
    const scan = scanLibrary({ home: bothLaunchers() });
    expect(scan.games.map((g) => g.id).sort()).toEqual(["lutris:1", "steam:1145350", "steam:1527950"]);
    expect(scan.duplicatesHidden).toBe(2);
    const wartales = scan.games.find((g) => g.id === "steam:1527950")!;
    expect(wartales.alternates?.map((a) => [a.id, a.launchUri])).toEqual([["lutris:3", "lutris:rungameid/3"]]);
    // The Lutris favorite carries over to the Steam copy that's shown.
    const favorites = scan.collections.find((c) => c.id === "lutris:favorite");
    expect(favorites?.gameIds).toEqual(new Set(["steam:1145350"]));
  });

  it("follows a custom launcher priority", () => {
    const scan = scanLibrary({ home: bothLaunchers(), launcherPriority: ["lutris", "steam"] });
    expect(scan.priority).toEqual(["lutris", "steam"]);
    expect(scan.games.map((g) => g.id).sort()).toEqual(["lutris:1", "lutris:2", "lutris:3"]);
    const wartales = scan.games.find((g) => g.id === "lutris:3")!;
    expect(wartales.launchUri).toBe("lutris:rungameid/3");
    expect(wartales.alternates?.map((a) => a.id)).toEqual(["steam:1527950"]);
    expect(wartales.steam?.appid).toBe(1527950); // Steam actions and hi-res art still available
    expect(scan.launchers.map((l) => l.launcher)).toEqual(["lutris", "steam"]);
  });

  it("shows every copy when duplicate hiding is off", () => {
    const scan = scanLibrary({ home: bothLaunchers(), hideDuplicates: false });
    expect(scan.games.map((g) => g.id).sort()).toEqual(["lutris:1", "lutris:2", "lutris:3", "steam:1145350", "steam:1527950"]);
    expect(scan.duplicatesHidden).toBe(0);
  });

  it("only scans enabled launchers", () => {
    const home = bothLaunchers();
    expect(scanLibrary({ home, enabledLaunchers: ["lutris"] }).games.map((g) => g.id).sort()).toEqual(["lutris:1", "lutris:2", "lutris:3"]);
    expect(scanLibrary({ home, enabledLaunchers: ["steam"] }).games.map((g) => g.id).sort()).toEqual(["steam:1145350", "steam:1527950"]);
  });

  it("offers launcher filters and per-launcher collections", () => {
    const scan = scanLibrary({ home: bothLaunchers() });
    const hidden = new Set<string>();
    const launchers = launcherOptions(scan, hidden);
    // Merged games count for every launcher they're installed through.
    expect(launchers.map((o) => [o.launcher, o.count])).toEqual([
      ["steam", 2],
      ["lutris", 3],
    ]);
    expect(applyFilter(scan, hidden, "launcher:lutris").map((g) => g.id).sort()).toEqual([
      "lutris:1",
      "steam:1145350",
      "steam:1527950",
    ]);
    expect(collectionOptions(scan, hidden).map((o) => [o.collection.source, o.collection.name, o.count])).toEqual([
      ["lutris", "Favorites", 1],
    ]);
    // A launcher filter falls back to everything once it's no longer offered.
    expect(resolveFilter("launcher:lutris", [], [])).toBe("visible");
  });
});

describe("mergeByPriority", () => {
  const g = (id: string, source: Game["source"], storeIds: string[], extra: Partial<Game> = {}) =>
    ({ id, source, storeIds, title: id, keywords: [id], lastPlayed: 0, artwork: {}, ...extra }) as Game;

  it("keeps the highest-priority copy as the entry and the others as alternates, regardless of input order", () => {
    const { games, aliases } = mergeByPriority([g("lutris:2", "lutris", ["steam:10"]), g("steam:10", "steam", ["steam:10"])]);
    expect(games.map((x) => x.id)).toEqual(["steam:10"]);
    expect(games[0]?.alternates?.map((x) => x.id)).toEqual(["lutris:2"]);
    expect(aliases).toEqual(new Map([["lutris:2", "steam:10"]]));
  });

  it("matches on any shared store id, and never merges games without one", () => {
    const { games } = mergeByPriority([
      g("lutris:1", "lutris", []),
      g("lutris:2", "lutris", []),
      g("lutris:3", "lutris", ["gog:5"]),
      g("lutris:4", "lutris", ["gog:5"]),
    ]);
    expect(games.map((x) => x.id)).toEqual(["lutris:1", "lutris:2", "lutris:3"]);
    expect(games[2]?.alternates?.map((x) => x.id)).toEqual(["lutris:4"]);
    expect(games[0]?.alternates).toBeUndefined();
  });

  it("respects a custom priority", () => {
    const { games } = mergeByPriority([g("steam:10", "steam", ["steam:10"]), g("lutris:2", "lutris", ["steam:10"])], ["lutris", "steam"]);
    expect(games.map((x) => x.id)).toEqual(["lutris:2"]);
    expect(games[0]?.alternates?.map((x) => x.id)).toEqual(["steam:10"]);
  });
});

describe("mergeCopies", () => {
  const steam = {
    id: "steam:10",
    source: "steam",
    title: "Game",
    launchUri: "steam://rungameid/10",
    installDir: "/steam/common/Game",
    sizeOnDisk: 5,
    lastPlayed: 100,
    playtimeMinutes: 600,
    artwork: { portrait: "/steam/p.jpg", hero: "/steam/hero.jpg" },
    customArtwork: { portrait: "/steam/grid/10p.png" },
    keywords: ["g", "10"],
    storeIds: ["steam:10"],
    steam: { appid: 10, isTool: false },
  } as Game;
  const lutris = {
    id: "lutris:2",
    source: "lutris",
    title: "Game",
    launchUri: "lutris:rungameid/2",
    lastPlayed: 300,
    playtimeMinutes: 30,
    artwork: { portrait: "/lutris/cover.jpg", header: "/lutris/banner.jpg" },
    keywords: ["g", "game"],
    storeIds: ["steam:10"],
    lutris: { id: 2, slug: "game", runner: "steam" },
  } as Game;

  it("opens with the preferred launcher and fills gaps from the other copies", () => {
    const merged = mergeCopies(lutris, [steam]);
    expect(merged).toMatchObject({
      id: "lutris:2",
      source: "lutris",
      launchUri: "lutris:rungameid/2",
      lastPlayed: 300, // most recent across copies
      playtimeMinutes: 600, // largest, not summed
      installDir: "/steam/common/Game", // Lutris had none
      sizeOnDisk: 5,
      artwork: { portrait: "/lutris/cover.jpg", header: "/lutris/banner.jpg", hero: "/steam/hero.jpg" },
      customArtwork: { portrait: "/steam/grid/10p.png" },
      storeIds: ["steam:10"],
      steam: { appid: 10, isTool: false }, // keeps Steam actions and hi-res art available
      lutris: { id: 2, slug: "game", runner: "steam" },
    });
    expect(merged.keywords).toEqual(["g", "game", "10"]);
    expect(merged.alternates).toEqual([steam]);
    expect(copiesOf(merged).map((c) => c.launchUri)).toEqual(["lutris:rungameid/2", "steam://rungameid/10"]);
    expect(launchersOf(merged)).toEqual(["lutris", "steam"]);
  });

  it("leaves a game with no other copies untouched", () => {
    expect(mergeCopies(steam, [])).toBe(steam);
  });
});

describe("launcher priority storage", () => {
  it("normalizes unknown, repeated and missing launchers", () => {
    expect(normalizePriority(["lutris", "heroic", "lutris"])).toEqual(["lutris", "steam"]);
    expect(normalizePriority("nonsense")).toEqual(["steam", "lutris"]);
  });

  it("saves, loads, and falls back to the default", () => {
    const path = join(makeTempDir(), "nested/launcher-priority.json");
    expect(loadPriority(path)).toEqual(["steam", "lutris"]);
    savePriority(path, ["lutris", "steam"]);
    expect(loadPriority(path)).toEqual(["lutris", "steam"]);
    writeFile(path, "{corrupt");
    expect(loadPriority(path)).toEqual(["steam", "lutris"]);
  });

  it("moves launchers within bounds", () => {
    expect(moveLauncher(["steam", "lutris"], "lutris", -1)).toEqual(["lutris", "steam"]);
    expect(moveLauncher(["steam", "lutris"], "steam", -1)).toEqual(["steam", "lutris"]);
    expect(moveLauncher(["steam", "lutris"], "lutris", 1)).toEqual(["steam", "lutris"]);
    expect(isDefaultPriority(["steam", "lutris"])).toBe(true);
    expect(isDefaultPriority(["lutris", "steam"])).toBe(false);
  });
});
