/**
 * The chat's own `UIMessage` shape.
 *
 * Until now every generic sat at its default, which meant the SDK's typed
 * `data-*` channel was switched off (`partGroups.ts` even pinned the data types
 * to `Record<string, never>`). Naming the data parts here turns that channel on:
 * a tool can push updates into the message *while it runs*, instead of a card
 * only ever being drawn twice — once on the call, once on the result.
 */

import type { UIMessage } from "ai";
import type { ViewSpec } from "../../components/AiRichUi";
import type { ChatMessageMetadata } from "./modelHistoryPortability";

export type TermcoDataParts = {
  /**
   * A rich view a running tool keeps redrawing. Reusing the part `id` replaces
   * the previous state, so the card updates in place; omit the id and the part
   * is transient (it shows during the run and never reaches the transcript).
   */
  view: {
    view: ViewSpec;
    /** Short status line under the header, e.g. the current step. */
    label?: string;
    /** The work behind it finished — stop the pulsing. */
    done?: boolean;
  };
};

export type TermcoUIMessage = UIMessage<ChatMessageMetadata, TermcoDataParts>;

/** The part type the writer emits and the transcript matches on. */
export const LIVE_VIEW_PART = "data-view" as const;
