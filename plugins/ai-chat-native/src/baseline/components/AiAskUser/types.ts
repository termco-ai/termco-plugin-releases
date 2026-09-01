/** Renderer-owned output/view types. The selected ask-user tool plugin owns
 * schema validation and returns these normalized shapes through its adapter. */
export type AskUserOutput = {
  answer: string;
  selected?: string[];
  freeText?: boolean;
  skipped?: boolean;
  stopped?: boolean;
};

export type AskUserOption = {
  label: string;
  description?: string;
  recommended?: boolean;
};

export type AskUserQuestion = {
  question: string;
  context?: string;
  options: AskUserOption[];
  allowFreeText?: boolean;
  multiSelect?: boolean;
  topic?: string;
  estimatedRemaining?: number;
};
