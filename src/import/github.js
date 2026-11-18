/**
 * GitHub file imports (B20, R3).
 */
import { FETCH_TIMEOUT_MS, IMPORT_MAX_BYTES } from "../constants.js";
import { ImportError, formatBytes } from "./errors.js";

const decode = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/** Reads "#L10", "#L10-L20" and "#L10C3-L20C9" line anchors. */
export function parseLineHash(hash) {
  const match = /^#L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?$/.exec(hash ?? "");
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2] ?? match[1]);
  if (a < 1 || b < 1) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/**
 * Parses a GitHub file link. Accepts github.com/<owner>/<repo>/blob|raw/<ref>/<path>
 * and raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>, with or without the
 * scheme, a query string or a #L line anchor. Throws ImportError with a message
 * for the user when the link is not usable.
 *
 * Returns { owner, repo, ref, path, rawUrl, lineRange }. A branch name containing
 * "/" cannot be told apart from the path; the raw URL keeps the original segments,
 * so the file still loads when GitHub resolves the ref, but `ref` and `path` shown
 * to the user may split it in the wrong place.
 */
export function parseGitHubUrl(input) {
  let text = String(input ?? "").trim();
  if (!text) throw new ImportError("Paste a GitHub file link first.");
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new ImportError("That does not look like a link. Paste the address of a file on GitHub.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImportError("Use an https:// link to a file on GitHub.");
  }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let owner;
  let repo;
  let rest;
  if (host === "github.com" || host === "www.github.com") {
    if (segments.length < 5 || !["blob", "raw"].includes(segments[2])) {
      throw new ImportError(
        "Use a link to a single file, such as github.com/user/repo/blob/main/file.py.",
      );
    }
    [owner, repo] = segments;
    rest = segments.slice(3);
  } else if (host === "raw.githubusercontent.com") {
    if (segments.length < 4) {
      throw new ImportError("That raw.githubusercontent.com link does not point to a file.");
    }
    [owner, repo] = segments;
    rest = segments.slice(2);
  } else {
    throw new ImportError(
      "Only github.com and raw.githubusercontent.com file links are supported.",
    );
  }
  // raw URLs may spell the ref as refs/heads/<branch> or refs/tags/<tag>.
  const refLength =
    rest[0] === "refs" && (rest[1] === "heads" || rest[1] === "tags") && rest.length > 3 ? 3 : 1;
  return {
    owner: decode(owner),
    repo: decode(repo),
    ref: rest.slice(0, refLength).map(decode).join("/"),
    path: rest.slice(refLength).map(decode).join("/"),
    rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join("/")}`,
    lineRange: parseLineHash(url.hash),
  };
}

/**
 * Downloads a raw file with a timeout and a size limit. Throws ImportError.
 */
export async function fetchGitHubFile(
  rawUrl,
  { fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = IMPORT_MAX_BYTES } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(rawUrl, { signal: controller.signal });
    if (response.status === 404) {
      throw new ImportError(
        "GitHub could not find that file (404). Check the link and that the repository is public.",
      );
    }
    if (!response.ok) throw new ImportError(`GitHub returned an error (${response.status}).`);
    const length = Number(response.headers?.get?.("content-length"));
    if (length > maxBytes) {
      throw new ImportError(
        `That file is ${formatBytes(length)}. CodeType imports files up to ${formatBytes(maxBytes)}.`,
      );
    }
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytesRead = 0;
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancel errors
          }
          throw new ImportError(
            `That file is too large. CodeType imports files up to ${formatBytes(maxBytes)}.`,
          );
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return text;
    }
    const text = await response.text();
    const byteLength = new TextEncoder().encode(text).length;
    if (byteLength > maxBytes) {
      throw new ImportError(
        `That file is too large. CodeType imports files up to ${formatBytes(maxBytes)}.`,
      );
    }
    return text;
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if (error?.name === "AbortError") {
      throw new ImportError("GitHub took too long to respond. Try again.");
    }
    throw new ImportError("Could not reach GitHub. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}
