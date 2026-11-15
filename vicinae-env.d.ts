/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Steam - Show games installed through Steam. */
	"enableSteam"?: boolean;

	/** Lutris - Show games installed through Lutris, including GOG, Epic and manually added games. */
	"enableLutris"?: boolean;

	/** Merge Duplicates - Show a game installed in several launchers as one entry. Choose which launcher opens it with the Launcher Priority action. */
	"hideDuplicates"?: boolean;

	/** Steam Folder - Only use the Steam install in this folder. Leave empty to find it automatically. */
	"steamPath"?: string;

	/** Show Steam Tools - Also list Proton, the Steam Linux Runtime and other non-game Steam apps. */
	"includeNonGames"?: boolean;

	/** Lutris Folder - Only use the Lutris data folder at this path (the one containing pga.db). Leave empty to find it automatically. */
	"lutrisPath"?: string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Search Games */
	export type SearchGames = ExtensionPreferences & {
		/** Layout - Show games as an artwork grid or a list. */
		"layout"?: "grid" | "list" | "list-detail";

		/** Grid Artwork - Which artwork the grid shows. */
		"artwork"?: "cover" | "banner" | "hero" | "logo";

		/** Games per Row - How many games fit in a grid row. Auto picks a size that suits the artwork. */
		"gridSize"?: "auto" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

		/** Grid Labels - Text shown under each game in the grid. */
		"labels"?: "full" | "title" | "none";

		/** Download High-Quality Artwork - Download higher-resolution covers, banners and icons where available, instead of the low-resolution copies launchers keep locally. Downloads are kept on disk. */
		"downloadArtwork"?: boolean;
	}
}

declare namespace Arguments {
  /** Command: Search Games */
	export type SearchGames = {
		
	}
}