import type { SessionQueryCapability, SessionQueryResult } from "@termco/session-base";
import ui from "@termco/ui";
import { useEffect, useRef, useState } from "react";

const { Dialog, DialogContent, DialogTitle, Input } = ui;

export function SearchDialog({
  open,
  onOpenChange,
  queryService,
  onOpenHit,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly queryService: SessionQueryCapability | null;
  readonly onOpenHit: (sessionId: string, eventSeq?: number, recordId?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<readonly SessionQueryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
  }, [open]);
  useEffect(() => {
    if (!open || !queryService) return;
    const text = query.trim();
    if (text.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const current = ++request.current;
    const timer = setTimeout(() => {
      void queryService.search({ text, limit: 50 }).then(
        (page) => {
          if (request.current !== current) return;
          setHits(page.results);
          setSearching(false);
        },
        () => {
          if (request.current !== current) return;
          setHits([]);
          setSearching(false);
        },
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query, queryService]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-3" data-testid="trajectory-search-dialog">
        <DialogTitle className="text-sm">Search sessions</DialogTitle>
        <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search semantic session records…" data-testid="trajectory-search-input" />
        <div className="max-h-96 min-h-24 overflow-auto rounded-md border border-border/60">
          {!queryService ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Session search is not active.</div>
          ) : hits.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">{searching ? "Searching…" : query.trim().length < 2 ? "Type at least 2 characters." : "No results."}</div>
          ) : hits.map((hit) => (
            <button key={hit.stableId} type="button" data-testid="trajectory-search-hit" data-record-id={hit.stableId} className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-xs hover:bg-muted/60" onClick={() => {
              onOpenChange(false);
              onOpenHit(hit.sessionId, hit.eventSeq, hit.stableId);
            }}>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{String(hit.sessionId).slice(0, 18)}{hit.eventSeq === undefined ? "" : `@${hit.eventSeq}`}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{hit.matchedText || hit.summary}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
