export type Segment = {
  label: string;
  fullPath: string;
  isHome: boolean;
};

const WINDOWS_DRIVE = /^([A-Za-z]:)(.*)$/;

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

export function segmentsFromCwd(cwd: string, home: string | null): Segment[] {
  const normalizedCwd = normalize(cwd);
  const normalizedHome = home !== null ? normalize(home) : null;
  const usingHome =
    normalizedHome !== null &&
    (normalizedCwd === normalizedHome ||
      normalizedCwd.startsWith(`${normalizedHome}/`));

  let rootSegment: Segment;
  let tail: string;
  if (usingHome) {
    rootSegment = {
      label: "~",
      fullPath: normalizedHome,
      isHome: true,
    };
    tail = normalizedCwd.slice(normalizedHome.length).replace(/^\//, "");
  } else {
    const driveMatch = WINDOWS_DRIVE.exec(normalizedCwd);
    if (driveMatch) {
      const drive = driveMatch[1];
      rootSegment = {
        label: drive,
        fullPath: `${drive}/`,
        isHome: false,
      };
      tail = driveMatch[2].replace(/^\//, "");
    } else {
      rootSegment = { label: "/", fullPath: "/", isHome: false };
      tail = normalizedCwd.replace(/^\//, "");
    }
  }

  const parts = tail === "" ? [] : tail.split("/").filter(Boolean);
  const segments: Segment[] = [rootSegment];
  let accumulated = rootSegment.fullPath;
  for (const part of parts) {
    accumulated = accumulated.endsWith("/")
      ? `${accumulated}${part}`
      : `${accumulated}/${part}`;
    segments.push({ label: part, fullPath: accumulated, isHome: false });
  }
  return segments;
}
