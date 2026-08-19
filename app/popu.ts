"use client";

// PopuMusic MIDI Browser WebView integration (docs/web-app-integration.md).
// Safe-area handling (§7) + native sampler opt-out (§6): this page plays its
// own Salamander/Web Audio piano, so the app sampler must be disabled.

type PopuDisplayInfo = {
  islandSide?: "top" | "bottom" | "left" | "right" | "unknown";
  safeAreaInsets?: { top?: number; right?: number; bottom?: number; left?: number };
};

type PopuWindow = Window & {
  popuDisplayInfo?: PopuDisplayInfo;
  samplerBridge?: { post: (json: string) => void };
  __samplerBridge?: { _resolve?: (response: unknown) => void } | null;
  __webMIDIBridge?: unknown;
  webkit?: { messageHandlers?: { midiBridge?: unknown } };
};

function popuWindow(): PopuWindow | null {
  return typeof window === "undefined" ? null : (window as PopuWindow);
}

/** True inside the PopuMusic MIDI Browser WebView (iOS bridge, or any platform). */
export function isPopuWebview(): boolean {
  const w = popuWindow();
  if (!w) return false;
  return Boolean(
    w.samplerBridge ||
      w.popuDisplayInfo ||
      w.__webMIDIBridge ||
      w.webkit?.messageHandlers?.midiBridge,
  );
}

function applyDisplayInfo(info?: PopuDisplayInfo) {
  const w = popuWindow();
  info = info ?? w?.popuDisplayInfo;
  if (!info?.safeAreaInsets) return;

  const insets = {
    top: Number(info.safeAreaInsets.top) || 0,
    right: Number(info.safeAreaInsets.right) || 0,
    bottom: Number(info.safeAreaInsets.bottom) || 0,
    left: Number(info.safeAreaInsets.left) || 0,
  };
  // Landscape WebKit reports the same inset on both sides (conservative
  // rectangle) — keep only the side the Dynamic Island is actually on.
  if (info.islandSide === "left") insets.right = 0;
  if (info.islandSide === "right") insets.left = 0;

  for (const edge of ["top", "right", "bottom", "left"] as const) {
    document.documentElement.style.setProperty(`--safe-${edge}`, `${insets[edge]}px`);
  }
}

/**
 * Portal back entry (§8.1): visible when the URL carries `popu-back`, when the
 * referrer comes from another origin, or when the page runs inside the App
 * WebView (App-injected objects detectable — covers entries that arrive
 * without `popu-back=1`, e.g. fx.popumusic.cn). Same-origin referrers and
 * direct opens in a plain browser stay button-less.
 */
export function resolveBackEntry(): { referrer: string } | null {
  if (typeof window === "undefined") return null;
  const flagged = new URLSearchParams(window.location.search).has("popu-back");
  let crossOriginReferrer = "";
  if (document.referrer) {
    try {
      const url = new URL(document.referrer, window.location.href);
      if (url.origin !== window.location.origin) crossOriginReferrer = url.toString();
    } catch { /* unparseable referrer */ }
  }
  if (flagged || crossOriginReferrer || isPopuWebview()) return { referrer: crossOriginReferrer };
  return null;
}

/** Prefer history.back(); fall back to the cross-site referrer when present. */
export function navigateBack(referrer: string) {
  if (history.length > 1) history.back();
  else if (referrer) window.location.assign(referrer);
}

export function initPopuDisplay() {
  if (typeof window === "undefined") return;
  window.addEventListener("popudisplaychange", (event) =>
    applyDisplayInfo((event as CustomEvent<PopuDisplayInfo>).detail),
  );
  applyDisplayInfo();
}

/**
 * Probe the native sampler and explicitly turn it off (page has own audio).
 * The bridge may be injected after page scripts load, so retry until it
 * appears; every step logs so the handshake is verifiable in the WebView
 * console (`__samplerBridgeLog` keeps the last outcome for remote debug).
 */
export async function disableNativeSampler(
  timeoutMs = 2000,
  retries = 15,
  retryDelayMs = 1000,
): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const sent = await disableNativeSamplerOnce(timeoutMs);
    if (sent || attempt >= retries) return sent;
    logSampler(`bridge not ready (attempt ${attempt + 1}), retrying…`);
    await new Promise((r) => setTimeout(r, retryDelayMs));
  }
}

function logSampler(message: string) {
  console.info(`[popu-sampler] ${message}`);
  const w = popuWindow();
  if (w) (w as PopuWindow & { __samplerBridgeLog?: string[] }).__samplerBridgeLog =
    [...((w as PopuWindow & { __samplerBridgeLog?: string[] }).__samplerBridgeLog ?? []), message].slice(-20);
}

async function disableNativeSamplerOnce(timeoutMs: number): Promise<boolean> {
  const w = popuWindow();
  const bridge = w?.samplerBridge;
  if (!bridge || typeof bridge.post !== "function") return false;

  const pending = new Map<number, { resolve: (p: Record<string, unknown>) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  w.__samplerBridge = w.__samplerBridge ?? {};
  w.__samplerBridge._resolve = (raw: unknown) => {
    const response = raw as { id?: number; ok?: boolean; payload?: { error?: string } & Record<string, unknown> };
    const request = response?.id != null ? pending.get(response.id) : undefined;
    if (!request) return;
    pending.delete(response.id!);
    clearTimeout(request.timer);
    if (response.ok) request.resolve(response.payload || {});
    else request.reject(new Error(response?.payload?.error || "Sampler request failed"));
  };

  const call = (cmd: string, payload: Record<string, unknown> = {}) => {
    const id = Date.now() + Math.floor(Math.random() * 1000) + pending.size;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Sampler request timed out: ${cmd}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      bridge.post(JSON.stringify({ id, cmd, payload }));
    });
  };

  try {
    const capability = await call("hasSampler");
    if (!capability.available) {
      logSampler("hasSampler: native sampler not available — nothing to disable");
      return false;
    }
    await call("setEnabled", { enabled: false });
    logSampler("sampler disabled via samplerBridge (setEnabled=false)");
    return true;
  } catch (e) {
    logSampler(`request failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
