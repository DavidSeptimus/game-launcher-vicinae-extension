/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Launchers - Include games installed through Steam. */
	"enableSteam"?: boolean;

	/** Include games installed through Lutris (GOG, Epic, Ubisoft, manually added games, ...). */
	"enableLutris"?: boolean;

	/** Duplicates - When the same game is installed through more than one launcher (e.g. a Steam game Lutris also manages), show only one copy. Steam takes precedence over Lutris. */
	"hideDuplicates"?: boolean;

	/** Steam Directory - Use only the Steam install in this folder (the one that contains steamapps/), instead of auto-detecting. Leave empty to auto-detect native, Flatpak, and Snap installs. */
	"steamPath"?: string;

	/** Steam Tools - Include Steam tools such as Proton and the Steam Linux Runtime in results. */
	"includeNonGames"?: boolean;

	/** Lutris Directory - Use only the Lutris data folder at this path (the one containing pga.db), instead of auto-detecting. Leave empty to auto-detect native and Flatpak installs. */
	"lutrisPath"?: string;

	/** Artwork Source - Steam's local cache only holds low-resolution art (300x450 covers, 32px icons). High resolution downloads sharper covers, banners and icons from Steam's CDN once and keeps them on disk. */
	"artworkSource"?: "hires" | "local";
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Search Games */
	export type SearchGames = ExtensionPreferences & {
		/** Layout - Show games as an artwork grid or a compact list. */
		"layout"?: "grid" | "list" | "list-detail";

		/** Grid Artwork - Which Steam artwork to show in the grid. */
		"artwork"?: "cover" | "banner" | "hero" | "logo";

		/** Grid Size - Games per row. Auto picks a size that suits the artwork. */
		"gridSize"?: "auto" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

		/** Grid Labels - Text shown under each game in the grid. */
		"labels"?: "full" | "title" | "none";
	}
}

declare namespace Arguments {
  /** Command: Search Games */
	export type SearchGames = {
		
	}
}