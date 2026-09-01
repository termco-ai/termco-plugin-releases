/**
 * Embedded-browser module surface. The command registrations live in the
 * `browser` main plugin (`electron/main/plugins/browser`); the view registry
 * (including its window-closed / did-navigate hooks) stays here.
 */
export { viewWebContents } from "./registry";
