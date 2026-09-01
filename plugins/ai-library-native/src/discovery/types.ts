import type {
  AiLibraryArtifactKind,
  AiLibraryDiscoveredArtifact,
  AiLibraryDiscoveryResult,
} from "@termco/ai-library-base";

export type Detector = {
  id: string;
  tool: string;
  kind: AiLibraryArtifactKind;
  match:
    | { t: "file"; path: string }
    | { t: "dirChildren"; dir: string; leaf?: string }
    | { t: "dirFiles"; dir: string; ext: string };
  target: AiLibraryDiscoveredArtifact["target"];
  scope: Array<"project" | "nested" | "global">;
};

export type ArtifactKind = AiLibraryArtifactKind;
export type DiscoveredArtifact = AiLibraryDiscoveredArtifact;
export type DiscoveryResult = AiLibraryDiscoveryResult;
