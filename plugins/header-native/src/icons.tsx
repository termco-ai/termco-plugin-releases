type IconName =
  | "sidebar" | "search" | "close" | "plus" | "folder" | "home"
  | "save" | "ai" | "agents" | "settings" | "bell" | "more"
  | "minimize" | "maximize" | "restore" | "external" | "chevron";

const paths: Record<IconName, string[]> = {
  sidebar: ["M4 5.5h16v13H4z", "M9 5.5v13"],
  search: ["M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z", "m16 16 4 4"],
  close: ["m7 7 10 10", "M17 7 7 17"],
  plus: ["M12 5v14", "M5 12h14"],
  folder: ["M3.5 7h6l2 2h9v9.5h-17z"],
  home: ["m4 11 8-7 8 7", "M6.5 9.5V20h11V9.5"],
  save: ["M5 4h12l2 2v14H5z", "M8 4v6h8V4", "M8 20v-6h8v6"],
  ai: ["M5 5h14v14H5z", "M9 9h6v6H9z"],
  agents: ["M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M16 13a3 3 0 1 0 0-6", "M3 20c0-4 2-6 5-6s5 2 5 6", "M13 16c1-2 2-3 4-3 3 0 4 2 4 5"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"],
  bell: ["M6 17h12l-1.5-2v-4a4.5 4.5 0 0 0-9 0v4z", "M10 20h4"],
  more: ["M6 12h.01M12 12h.01M18 12h.01"],
  minimize: ["M5 12h14"],
  maximize: ["M6 6h12v12H6z"],
  restore: ["M8 5h11v11", "M5 8h11v11H5z"],
  external: ["M14 5h5v5", "m19 5-8 8", "M17 13v6H5V7h6"],
  chevron: ["m8 10 4 4 4-4"],
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {paths[name].map((path, index) => <path key={index} d={path} />)}
  </svg>;
}
