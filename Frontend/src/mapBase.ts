import L from "leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl, type ExpressionSpecification, type Map as GlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre draws in a background worker; let Vite bundle it and tell MapLibre where it is.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);

/**
 * The background map, with place and street names in the app's language. Drawn in the browser from
 * OpenStreetMap data (OpenFreeMap, free, no key), so labels can be switched; ready-made map images
 * (tile.openstreetmap.org) always show Korean names in Korea.
 */
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/** The name to show: the app's language first, then English or the romanised name, then the local name. */
function nameIn(lang: string): ExpressionSpecification {
  const get = (k: string): ExpressionSpecification => ["get", k];
  if (lang.startsWith("ko")) return ["coalesce", get("name:ko"), get("name")];
  const own = lang.startsWith("en") ? [] : [get(`name:${lang.slice(0, 2)}`)];
  return ["coalesce", ...own, get("name:en"), get("name_en"), get("name:latin"), get("name")];
}

function relabel(gl: GlMap, lang: string) {
  for (const layer of gl.getStyle()?.layers ?? []) {
    if (layer.type !== "symbol") continue;
    const field = gl.getLayoutProperty(layer.id, "text-field");
    if (field && JSON.stringify(field).includes('"name')) gl.setLayoutProperty(layer.id, "text-field", nameIn(lang));
  }
}

function webglWorks() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export interface BaseMap { layer: L.Layer; setLanguage: (lang: string) => void }

/** A vector base map in `lang`; without WebGL, the plain OpenStreetMap images (Korean names) instead. */
export function baseMap(lang: string): BaseMap {
  if (!webglWorks()) {
    return {
      layer: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }),
      setLanguage: () => {},
    };
  }
  let current = lang;
  const layer = maplibreGL({ style: STYLE, attribution: ATTRIBUTION } as Parameters<typeof maplibreGL>[0]);
  const whenReady = (fn: (gl: GlMap) => void) => {
    const gl = layer.getMaplibreMap?.();
    if (!gl) return;
    if (gl.isStyleLoaded()) fn(gl); else gl.once("styledata", () => fn(gl));
  };
  layer.on("add", () => whenReady((gl) => relabel(gl, current)));
  return {
    layer,
    setLanguage: (next) => { current = next; whenReady((gl) => relabel(gl, next)); },
  };
}
