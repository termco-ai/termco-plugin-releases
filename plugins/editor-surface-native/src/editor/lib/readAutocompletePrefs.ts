/** Project the selected autocomplete workflow settings without exposing
 * credentials or provider endpoints to the editor. The shared inference
 * provider resolves both from the public model id. */
import { usePreferencesStore } from "../../preferences";
import type { AutocompletePrefs } from "./autocomplete/inlineExtension";

export function readAutocompletePrefs(): AutocompletePrefs {
  const state = usePreferencesStore.getState();
  return {
    enabled: state.autocompleteEnabled,
    modelId: state.autocompleteModelId,
  };
}
