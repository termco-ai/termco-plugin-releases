import type { UiStatusbarRuntime } from "@termco/ui-statusbar-base";
import { segmentsFromCwd } from "../lib/pathUtils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "../ui";
import { BreadcrumbSegment } from "./BreadcrumbSegment";
import { CollapsedSegments } from "./CollapsedSegments";
import { CurrentSegmentDropdown } from "./CurrentSegmentDropdown";

type ListSubdirs = (
  path: string,
  workspace: UiStatusbarRuntime["workspace"],
) => Promise<readonly string[]>;

function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? "/" : path.slice(0, index);
}

function basename(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? path : path.slice(index + 1);
}

function displayPath(path: string, platform: UiStatusbarRuntime["platform"]): string {
  if (platform !== "macos") return path;
  if (path === "/private/var" || path.startsWith("/private/var/")) {
    return path.slice("/private".length);
  }
  if (path === "/private/tmp" || path.startsWith("/private/tmp/")) {
    return path.slice("/private".length);
  }
  return path;
}

export function CwdBreadcrumb({
  cwd,
  platform,
  workspace,
  filePath,
  home,
  onCd,
  listSubdirs,
}: {
  cwd: string | null;
  platform?: UiStatusbarRuntime["platform"];
  workspace: UiStatusbarRuntime["workspace"];
  filePath?: string | null;
  home: string | null;
  onCd: (path: string) => void;
  listSubdirs: ListSubdirs;
}) {
  const displayPlatform = platform ?? "macos";
  if (filePath) {
    const visibleFilePath = displayPath(filePath, displayPlatform);
    const directory = dirname(visibleFilePath);
    const name = basename(visibleFilePath);
    const segments = segmentsFromCwd(directory, home);
    const first = segments[0];
    const middle = segments.slice(1);
    return (
      <Breadcrumb>
        <BreadcrumbList className="gap-1 text-xs sm:gap-1.5">
          {first ? (
            <BreadcrumbSegment
              label={first.label}
              isHome={first.isHome}
              onClick={() => onCd(first.fullPath)}
            />
          ) : null}
          {middle.length > 0 ? (
            <CollapsedSegments segments={middle} onCd={onCd} />
          ) : null}
          {middle.map((segment) => (
            <span key={segment.fullPath} className="contents max-md:hidden">
              <BreadcrumbSegment
                label={segment.label}
                isHome={segment.isHome}
                onClick={() => onCd(segment.fullPath)}
              />
            </span>
          ))}
          <BreadcrumbItem>
            <BreadcrumbPage className="text-foreground">{name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (!cwd) {
    return <span className="text-xs text-muted-foreground/70">no directory</span>;
  }

  const segments = segmentsFromCwd(displayPath(cwd, displayPlatform), home);
  const current = segments[segments.length - 1];
  const parents = segments.slice(0, -1);
  const firstParent = parents[0];
  const middleParents = parents.slice(1);
  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1 text-xs sm:gap-1.5">
        {firstParent ? (
          <BreadcrumbSegment
            label={firstParent.label}
            isHome={firstParent.isHome}
            onClick={() => onCd(firstParent.fullPath)}
          />
        ) : null}
        {middleParents.length > 0 ? (
          <CollapsedSegments segments={middleParents} onCd={onCd} />
        ) : null}
        {middleParents.map((segment) => (
          <span key={segment.fullPath} className="contents max-md:hidden">
            <BreadcrumbSegment
              label={segment.label}
              isHome={segment.isHome}
              onClick={() => onCd(segment.fullPath)}
            />
          </span>
        ))}
        <BreadcrumbItem>
          <CurrentSegmentDropdown
            label={current.label}
            path={current.fullPath}
            workspace={workspace}
            onCd={onCd}
            listSubdirs={listSubdirs}
          />
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
