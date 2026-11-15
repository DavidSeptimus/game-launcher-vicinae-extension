/**
 * On-disk cache of high-resolution artwork downloaded from Steam's CDN.
 *
 * Steam's local librarycache holds 1x art (300x450 covers, 460x215 banners,
 * 32x32 icons), which looks soft on HiDPI screens. The CDN serves 2x variants
 * for most apps, and each app's client .ico often contains icons up to 512px.
 *
 * Layout: <dir>/steam/<appid>/
 *   portrait@2x.jpg, header@2x.jpg  2x CDN art (preferred)
 *   portrait@1x.jpg, header@1x.jpg  1x CDN art, only fetched when Steam has no local copy
 *   icon.png                        largest image from the client .ico, only kept if >= 64px
 *   <kind>.missing                  marker: nothing acceptable was available at that time
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractLargestIcon } from "./image/ico";

export type CachedKind = "portrait" | "header" | "icon";
type ImageKind = Exclude<CachedKind, "icon">;

const CDN = "https://cdn.cloudflare.steamstatic.com";
/** Icons smaller than this are no sharper than Steam's local 32px icon. */
export const MIN_SHARP_ICON = 64;
/** Re-download cached art after this long so updated store art eventually shows up. */
const REFRESH_AFTER_MS = 30 * 24 * 3600 * 1000;
/** Retry failed / missing downloads after this long. */
const RETRY_MISSING_AFTER_MS = 7 * 24 * 3600 * 1000;
/** Temp files older than this are leftovers from an interrupted write. */
const STALE_TMP_MS = 3600 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const CDN_NAMES: Record<ImageKind, { "2x": string; "1x": string }> = {
  portrait: { "2x": "library_600x900_2x.jpg", "1x": "library_600x900.jpg" },
  header: { "2x": "library_header_2x.jpg", "1x": "header.jpg" },
};

/** Every file name the cache writes, for pruning anything else (old layouts, junk). */
const KNOWN_FILES = new Set([
  "portrait@2x.jpg",
  "portrait@1x.jpg",
  "header@2x.jpg",
  "header@1x.jpg",
  "icon.png",
  "portrait.missing",
  "header.missing",
  "icon.missing",
]);

export function cdnUrl(appid: number, kind: ImageKind, scale: "2x" | "1x"): string {
  return `${CDN}/steam/apps/${appid}/${CDN_NAMES[kind][scale]}`;
}

export function clientIconUrl(appid: number, hash: string): string {
  return `${CDN}/steamcommunity/public/images/apps/${appid}/${hash}.ico`;
}

export interface ArtworkRequest {
  appid: number;
  kind: CachedKind;
  /**
   * Whether the launcher already has a local copy of this kind (Steam's 1x
   * art). If so, only a 2x download is worth having; a 1x download would just
   * duplicate it.
   */
  hasLocal?: boolean;
  /** For icons: the appinfo clienticon hash. */
  clientIcon?: string;
  /** For icons: a local copy of the .ico (Steam keeps one in steam/games/ once a shortcut exists). */
  localIco?: string;
}

export interface ArtworkCacheOptions {
  /** May be false to only use local .ico files and never touch the network. */
  allowNetwork: boolean;
  fetch?: typeof fetch;
  now?: () => number;
}

export class ArtworkCache {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(
    readonly dir: string,
    private readonly options: ArtworkCacheOptions,
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  private appDir(appid: number): string {
    return join(this.dir, "steam", String(appid));
  }

  private file(appid: number, name: string): string {
    return join(this.appDir(appid), name);
  }

  private markerFor(appid: number, kind: CachedKind): string {
    return this.file(appid, `${kind}.missing`);
  }

  private ageMs(path: string): number | undefined {
    try {
      return this.now() - statSync(path).mtimeMs;
    } catch {
      return undefined;
    }
  }

  /**
   * Best cached file for this request, if any (even if due for a refresh).
   * A cached 1x image is ignored when the launcher has its own local copy.
   * Synchronous so it can be used while rendering.
   */
  get(appid: number, kind: CachedKind, hasLocal = false): string | undefined {
    const candidates = kind === "icon" ? ["icon.png"] : hasLocal ? [`${kind}@2x.jpg`] : [`${kind}@2x.jpg`, `${kind}@1x.jpg`];
    for (const name of candidates) {
      const path = this.file(appid, name);
      if (existsSync(path)) return path;
    }
    return undefined;
  }

  /** Whether `ensure` would do any work for this request. */
  needsFetch(req: ArtworkRequest): boolean {
    if (req.kind === "icon" && !req.clientIcon) return false;
    if (!this.options.allowNetwork && !(req.kind === "icon" && req.localIco && existsSync(req.localIco))) return false;
    const missingAge = this.ageMs(this.markerFor(req.appid, req.kind));
    if (missingAge !== undefined && missingAge <= RETRY_MISSING_AFTER_MS) return false;
    const cached = this.get(req.appid, req.kind, req.hasLocal);
    if (!cached) return true;
    // A 1x download is a stopgap for apps Steam had no art for: keep trying for 2x on the normal schedule.
    const age = this.ageMs(cached);
    return age === undefined || age > REFRESH_AFTER_MS;
  }

  /** Download (or extract) the artwork if needed. Resolves to the best cached path, or undefined if unavailable. */
  async ensure(req: ArtworkRequest): Promise<string | undefined> {
    if (!this.needsFetch(req)) return this.get(req.appid, req.kind, req.hasLocal);
    try {
      const saved = req.kind === "icon" ? await this.fetchIcon(req) : await this.fetchImage(req, req.kind);
      if (!saved) this.write(this.markerFor(req.appid, req.kind), Buffer.from(String(this.now())));
      else this.remove(this.markerFor(req.appid, req.kind));
    } catch {
      // Network errors are transient: don't write a marker, try again next time.
    }
    return this.get(req.appid, req.kind, req.hasLocal);
  }

  private async fetchImage(req: ArtworkRequest, kind: ImageKind): Promise<boolean> {
    const hi = await this.download(cdnUrl(req.appid, kind, "2x"));
    if (hi) {
      this.write(this.file(req.appid, `${kind}@2x.jpg`), hi);
      this.remove(this.file(req.appid, `${kind}@1x.jpg`)); // superseded
      return true;
    }
    if (req.hasLocal) return false; // the 1x CDN image is the same as the local copy
    const lo = await this.download(cdnUrl(req.appid, kind, "1x"));
    if (lo) this.write(this.file(req.appid, `${kind}@1x.jpg`), lo);
    return Boolean(lo);
  }

  private async fetchIcon(req: ArtworkRequest): Promise<boolean> {
    let ico: Buffer | undefined;
    if (req.localIco && existsSync(req.localIco)) ico = readFileSync(req.localIco);
    else if (this.options.allowNetwork && req.clientIcon) ico = await this.download(clientIconUrl(req.appid, req.clientIcon));
    if (!ico) return false;
    let icon;
    try {
      icon = extractLargestIcon(ico);
    } catch {
      return false;
    }
    if (!icon || icon.size < MIN_SHARP_ICON) return false;
    this.write(this.file(req.appid, "icon.png"), icon.png);
    return true;
  }

  /** The image at `url`, or undefined on 403/404/non-image. Throws on network errors and 5xx. */
  private async download(url: string): Promise<Buffer | undefined> {
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 404 || res.status === 403) return undefined;
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const type = res.headers.get("content-type") ?? "";
    const body = Buffer.from(await res.arrayBuffer());
    const isImage = type.startsWith("image/") || type === "application/octet-stream" || type === "";
    return body.length > 0 && isImage ? body : undefined;
  }

  /** Atomic write so a half-downloaded file is never rendered. */
  private write(path: string, data: Buffer): void {
    mkdirSync(join(path, ".."), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  }

  private remove(path: string): void {
    try {
      unlinkSync(path);
    } catch {
      // already gone
    }
  }

  /** Number of files and bytes currently cached. */
  usage(): { files: number; bytes: number } {
    let files = 0;
    let bytes = 0;
    const walk = (dir: string) => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const path = join(dir, e.name);
        if (e.isDirectory()) walk(path);
        else if (!e.name.endsWith(".missing")) {
          files++;
          bytes += statSync(path, { throwIfNoEntry: false })?.size ?? 0;
        }
      }
    };
    walk(join(this.dir, "steam"));
    return { files, bytes };
  }

  /** Delete everything this cache has downloaded or extracted, including "missing" markers. */
  clear(): { files: number; bytes: number } {
    const usage = this.usage();
    rmSync(join(this.dir, "steam"), { recursive: true, force: true });
    return usage;
  }

  /**
   * Delete cached art for apps that are no longer installed, files from older
   * cache layouts, and stale temp files. Returns the number of entries removed.
   */
  prune(installedAppids: ReadonlySet<number>): number {
    const root = join(this.dir, "steam");
    let removed = 0;
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const appDir = join(root, entry);
      if (!/^\d+$/.test(entry) || !installedAppids.has(Number(entry))) {
        rmSync(appDir, { recursive: true, force: true });
        removed++;
        continue;
      }
      let files: string[];
      try {
        files = readdirSync(appDir);
      } catch {
        continue;
      }
      for (const name of files) {
        if (KNOWN_FILES.has(name)) continue;
        const path = join(appDir, name);
        // A temp file may belong to a download in flight in another process; only clear old ones.
        if (name.endsWith(".tmp") && (this.ageMs(path) ?? Infinity) < STALE_TMP_MS) continue;
        rmSync(path, { recursive: true, force: true });
        removed++;
      }
    }
    return removed;
  }
}

/** Run `fn` over `items` with bounded concurrency. */
export async function forEachLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
