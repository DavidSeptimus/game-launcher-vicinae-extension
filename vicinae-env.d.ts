/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Steam Directory - Override Steam install detection (the folder that contains steamapps/). Leave empty to auto-detect native, Flatpak, and Snap installs. */
	"steamPath"?: string;

	/** Steam Tools - Include Steam tools such as Proton and the Steam Linux Runtime in results. */
	"includeNonGames"?: boolean;

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