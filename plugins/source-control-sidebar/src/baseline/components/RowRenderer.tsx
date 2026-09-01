import { memo } from "react";
import { DivergedBanner } from "./DivergedBanner";
import { EntryRow } from "./EntryRow";
import { ListHeader } from "./ListHeader";
import type { RowRendererProps } from "./types";

export const RowRenderer = memo(function RowRenderer(props: RowRendererProps) {
  const { row } = props;
  switch (row.kind) {
    case "banner-diverged":
      return <DivergedBanner />;
    case "list-header":
      return <ListHeader {...props} row={row} />;
    case "entry":
      return <EntryRow {...props} row={row} />;
  }
});
