import { safeProjectPath, type ProjectFileRecord } from "./project-files";

const MAX_VERSION_FILES = 80;
const MAX_FILE_BYTES = 120_000;
const MAX_SNAPSHOT_BYTES = 2_000_000;

export class InvalidProjectVersionError extends Error {}

export function parseProjectSnapshot(snapshotJson: string): ProjectFileRecord[] {
  if (Buffer.byteLength(snapshotJson, "utf8") > MAX_SNAPSHOT_BYTES) {
    throw new InvalidProjectVersionError("This version snapshot is too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    throw new InvalidProjectVersionError("This version snapshot is invalid.");
  }

  if (!Array.isArray(parsed) || !parsed.length || parsed.length > MAX_VERSION_FILES) {
    throw new InvalidProjectVersionError("This version cannot be restored safely.");
  }

  const paths = new Set<string>();
  const files = parsed.map((value): ProjectFileRecord => {
    if (!value || typeof value !== "object" || !("path" in value) || !("content" in value)) {
      throw new InvalidProjectVersionError("This version snapshot is invalid.");
    }
    const path = safeProjectPath(typeof value.path === "string" ? value.path : "");
    const content = typeof value.content === "string" ? value.content : null;
    const language = "language" in value && typeof value.language === "string" ? value.language.slice(0, 40) : "text";
    if (!path || content === null || Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES || paths.has(path)) {
      throw new InvalidProjectVersionError("This version cannot be restored safely.");
    }
    paths.add(path);
    return { path, content, language };
  });

  return files;
}

