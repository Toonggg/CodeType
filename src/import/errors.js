/**
 * An error whose message is written for the user and can be shown as-is.
 */
export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImportError";
  }
}

export function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} bytes`;
}
