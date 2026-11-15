/**
 * Which games are hidden. Two sources are merged:
 *   - games hidden with this extension's own Hide action, and
 *   - games in the launcher's own hidden list (Steam's Hidden collection).
 *
 * We never write to Steam's data. Unhiding a Steam-hidden game here records a
 * "shown" override instead, so it reappears here but stays hidden in Steam.
 */

export interface HiddenState {
  /** Hidden with this extension. */
  hidden: ReadonlySet<string>;
  /** Hidden in the launcher, but explicitly shown here. */
  shown: ReadonlySet<string>;
}

export const emptyHiddenState = (): HiddenState => ({ hidden: new Set(), shown: new Set() });

export function isHidden(id: string, state: HiddenState, hiddenInLauncher: ReadonlySet<string>): boolean {
  return state.hidden.has(id) || (hiddenInLauncher.has(id) && !state.shown.has(id));
}

export interface ToggleResult {
  state: HiddenState;
  nowHidden: boolean;
  /** Unhidden here, but the launcher still hides it. */
  stillHiddenInLauncher: boolean;
}

export function toggleHidden(id: string, state: HiddenState, hiddenInLauncher: ReadonlySet<string>): ToggleResult {
  const hidden = new Set(state.hidden);
  const shown = new Set(state.shown);
  const inLauncher = hiddenInLauncher.has(id);
  if (isHidden(id, state, hiddenInLauncher)) {
    hidden.delete(id);
    if (inLauncher) shown.add(id);
    return { state: { hidden, shown }, nowHidden: false, stillHiddenInLauncher: inLauncher };
  }
  // Hiding again: for a launcher-hidden game, dropping the override is enough.
  if (inLauncher) shown.delete(id);
  else hidden.add(id);
  return { state: { hidden, shown }, nowHidden: true, stillHiddenInLauncher: false };
}

/**
 * Drop "shown" overrides for games the launcher no longer hides, so that if
 * the user hides them in Steam again later, they're hidden here too.
 * Returns undefined when nothing changed.
 */
export function pruneShown(state: HiddenState, hiddenInLauncher: ReadonlySet<string>): HiddenState | undefined {
  const shown = new Set([...state.shown].filter((id) => hiddenInLauncher.has(id)));
  return shown.size === state.shown.size ? undefined : { hidden: state.hidden, shown };
}
