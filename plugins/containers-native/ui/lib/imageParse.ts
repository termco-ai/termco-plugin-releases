/**
 * Parse `docker/podman image inspect <ref>` JSON into the image facts the
 * detail tab's Image section renders: size, platform, layer count, digest,
 * baked-in env and exposed ports. Defensive — a missing/broken payload yields
 * an empty ImageInfo, never throws. Pure; unit-tested.
 */

export type ImageInfo = {
  size: number;
  arch: string;
  os: string;
  layers: number;
  digest: string;
  created: string;
  envBaked: string[];
  exposedPorts: string[];
};

export function emptyImage(): ImageInfo {
  return {
    size: 0,
    arch: "",
    os: "",
    layers: 0,
    digest: "",
    created: "",
    envBaked: [],
    exposedPorts: [],
  };
}

type ImageObject = {
  Id?: string;
  Size?: number;
  Architecture?: string;
  Os?: string;
  Created?: string;
  RepoDigests?: string[] | null;
  RootFS?: { Layers?: string[] | null } | null;
  Config?: {
    Env?: string[] | null;
    ExposedPorts?: Record<string, unknown> | null;
  } | null;
};

function shortDigest(id: string): string {
  const m = id.match(/sha256:([0-9a-f]+)/i);
  return m ? m[1].slice(0, 12) : id.replace(/^sha256:/, "").slice(0, 12);
}

export function parseImage(json: string): ImageInfo {
  let obj: ImageObject | undefined;
  try {
    const parsed = JSON.parse(json);
    obj = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    return emptyImage();
  }
  if (!obj || typeof obj !== "object") return emptyImage();

  const info = emptyImage();
  info.size = typeof obj.Size === "number" ? obj.Size : 0;
  info.arch = (obj.Architecture ?? "").trim();
  info.os = (obj.Os ?? "").trim();
  info.layers = obj.RootFS?.Layers?.length ?? 0;
  const digestSrc = obj.RepoDigests?.[0] ?? obj.Id ?? "";
  info.digest = digestSrc ? shortDigest(digestSrc) : "";
  info.created = (obj.Created ?? "").replace("T", " ").replace(/\..*/, "");
  info.envBaked = obj.Config?.Env ?? [];
  info.exposedPorts = Object.keys(obj.Config?.ExposedPorts ?? {});
  return info;
}
