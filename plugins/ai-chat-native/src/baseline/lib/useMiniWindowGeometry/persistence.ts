// Mini-window geometry persistence + viewport helpers: localStorage load/save
// (tolerating corrupt entries and private-mode quota failures) and the gesture
// compute-fn signature shared by drag/resize.
import type { Geom, Viewport } from "../miniWindowGeometry";

const STORE_KEY = "termco-ui-mini-window-geom";

export const viewport = (): Viewport => ({
  vw: window.innerWidth,
  vh: window.innerHeight,
});

export function loadGeom(): Geom | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Geom>;
    if (
      typeof p.x === "number" &&
      typeof p.y === "number" &&
      typeof p.w === "number" &&
      typeof p.h === "number"
    ) {
      return { x: p.x, y: p.y, w: p.w, h: p.h };
    }
  } catch {
    // corrupt entry — fall back to default placement
  }
  return null;
}

export function saveGeom(g: Geom) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(g));
  } catch {
    // private mode / quota — geometry just won't persist
  }
}

export type Compute = (
  start: Geom,
  dx: number,
  dy: number,
  vp: Viewport,
) => Geom;
