import { describe, expect, it } from "vitest";
import { neededKinds, requestFor } from "../src/lib/artwork-requests";
import type { Game } from "../src/lib/games";
import { resolveViewSettings } from "../src/lib/view-settings";

const game = (artwork: Game["artwork"], customArtwork?: Game["customArtwork"]): Game => ({
  id: "steam:7",
  source: "steam",
  title: "T",
  launchUri: "steam://rungameid/7",
  lastPlayed: 0,
  keywords: [],
  artwork: { ...artwork, ...customArtwork },
  customArtwork,
  steam: { appid: 7, isTool: false, clientIcon: "abc" },
});

describe("neededKinds", () => {
  it.each([
    [{ artwork: "cover" }, ["portrait"]],
    [{ artwork: "banner" }, ["header"]],
    [{ artwork: "hero" }, []],
    [{ artwork: "logo" }, []],
    [{ layout: "list" }, ["icon", "header"]],
    [{ layout: "list-detail", artwork: "hero" }, ["icon", "header"]],
  ])("%j -> %j", (prefs, kinds) => {
    expect(neededKinds(resolveViewSettings(prefs))).toEqual(kinds);
  });
});

describe("requestFor", () => {
  it("flags whether a local copy exists", () => {
    expect(requestFor(game({ portrait: "/p.jpg" }), "portrait")).toMatchObject({ appid: 7, kind: "portrait", hasLocal: true });
    expect(requestFor(game({}), "portrait")).toMatchObject({ hasLocal: false });
    expect(requestFor(game({}), "icon")).toMatchObject({ kind: "icon", clientIcon: "abc" });
  });

  it("never requests a download where custom art is set", () => {
    expect(requestFor(game({ header: "/h.jpg" }, { portrait: "/grid/7p.png" }), "portrait")).toBeUndefined();
    expect(requestFor(game({ header: "/h.jpg" }, { portrait: "/grid/7p.png" }), "header")).toBeDefined();
  });

  it("only handles Steam games", () => {
    expect(requestFor({ ...game({}), steam: undefined }, "portrait")).toBeUndefined();
  });
});
