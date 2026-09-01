/** Electron reports its framework name for an unpackaged application. Product
 * identity remains stable in development and follows the packaged app name. */
export function applicationName(
  packaged: boolean,
  electronName: string,
): string {
  return packaged ? electronName : "Termco";
}
