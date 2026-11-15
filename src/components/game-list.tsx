import { Action, Icon, type Image, List } from "@vicinae/api";
import { useState } from "react";
import { formatBytes, formatLastPlayed, formatPlaytime } from "../lib/format";
import type { Game, GameArtwork } from "../lib/games";
import { pickArtwork, pickListIcon } from "../lib/view-settings";
import { GameActions } from "./game-actions";
import type { GameViewProps } from "./game-grid";

/** Markdown image for a local path or URL, sized for the detail pane. */
function markdownImage(source: string, alt: string): string {
  const url = /^https?:\/\//.test(source) ? source : `file://${encodeURI(source)}`;
  return `![${alt.replace(/[[\]]/g, "")}](${url}?raycast-width=460)`;
}

function listIcon(game: Game, hires: GameArtwork | undefined): Image.ImageLike {
  const icon = pickListIcon(game, hires);
  return icon ? { source: icon.source, fallback: icon.fallback ?? Icon.GameController } : Icon.GameController;
}

function GameDetail(props: { game: Game; hires: GameArtwork | undefined; collections: string[] }) {
  const { game, hires, collections } = props;
  const art = pickArtwork(game, "banner", hires);
  const playtime = formatPlaytime(game.playtimeMinutes);
  const size = formatBytes(game.sizeOnDisk);
  return (
    <List.Item.Detail
      markdown={art ? markdownImage(art.source, game.title) : `# ${game.title}`}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Title" text={game.title} />
          <List.Item.Detail.Metadata.Label title="Last Played" text={formatLastPlayed(game.lastPlayed).replace(/^Played /, "")} />
          {playtime && <List.Item.Detail.Metadata.Label title="Playtime" text={playtime} />}
          {size && <List.Item.Detail.Metadata.Label title="Size on Disk" text={size} />}
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Launcher" text="Steam" />
          {collections.length > 0 && <List.Item.Detail.Metadata.Label title="Collections" text={collections.join(", ")} />}
          {game.steam && <List.Item.Detail.Metadata.Label title="App ID" text={String(game.steam.appid)} />}
          {game.installDir && <List.Item.Detail.Metadata.Label title="Install Folder" text={game.installDir} />}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

export function GameList(props: GameViewProps & { initialShowDetail: boolean }) {
  const { games, hidden, hires } = props;
  const [showDetail, setShowDetail] = useState(props.initialShowDetail);

  const toggleDetail = (
    <Action
      title={showDetail ? "Hide Details" : "Show Details"}
      icon={Icon.AppWindowSidebarRight}
      shortcut={{ modifiers: ["ctrl"], key: "d" }}
      onAction={() => setShowDetail((v) => !v)}
    />
  );

  return (
    <List
      isLoading={props.isLoading}
      isShowingDetail={showDetail && games.length > 0}
      searchBarPlaceholder="Search games…"
      navigationTitle="Search Games"
      searchBarAccessory={props.searchBarAccessory}
    >
      {games.length === 0 && !props.isLoading
        ? props.emptyView
        : games.map((game) => {
            const playtime = formatPlaytime(game.playtimeMinutes);
            return (
              <List.Item
                key={game.id}
                id={game.id}
                title={game.title}
                icon={listIcon(game, hires.get(game.id))}
                keywords={game.keywords}
                accessories={
                  showDetail
                    ? undefined
                    : [
                        ...(playtime ? [{ text: playtime, icon: Icon.Hourglass, tooltip: "Playtime" }] : []),
                        { text: formatLastPlayed(game.lastPlayed).replace(/^Played /, ""), icon: Icon.Clock, tooltip: "Last played" },
                      ]
                }
                detail={showDetail ? <GameDetail game={game} hires={hires.get(game.id)} collections={props.collectionNames(game.id)} /> : undefined}
                actions={
                  <GameActions
                    game={game}
                    isHidden={hidden.has(game.id)}
                    onToggleHidden={props.onToggleHidden}
                    onClearCache={props.onClearCache}
                    layoutActions={toggleDetail}
                  />
                }
              />
            );
          })}
    </List>
  );
}
