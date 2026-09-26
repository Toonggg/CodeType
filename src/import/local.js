/**
 * Local file imports (B12, B13).
 */
import { IMPORT_MAX_BYTES } from "../constants.js";
import { ImportError, formatBytes } from "./errors.js";

function readAsText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

/** Reads a File as text, refusing files over the size limit. Throws ImportError. */
export async function readLocalFile(file, { maxBytes = IMPORT_MAX_BYTES } = {}) {
  if (file.size > maxBytes) {
    throw new ImportError(
      `${file.name} is ${formatBytes(file.size)}. CodeType imports files up to ${formatBytes(maxBytes)}.`,
    );
  }
  try {
    return await readAsText(file);
  } catch {
    throw new ImportError(`Could not read ${file.name}. Try choosing it again.`);
  }
}
