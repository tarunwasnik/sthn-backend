import path from "node:path";

/**
 * Resolves an immutable Collection C manifest asset path for qualification
 * tooling. The frozen manifest was authored on Windows, so its relative paths
 * may use either separator; the authority string itself is never rewritten.
 */
export const resolveCollectionCQualificationAsset = (benchmarkRoot: string, manifestRelativePath: string): string => {
  if (typeof manifestRelativePath !== "string" || manifestRelativePath.length === 0 || manifestRelativePath.includes("\0")) {
    throw new Error("Collection C manifest asset path is missing or invalid");
  }

  // Reject both host-native and Windows forms before normalizing separators.
  if (path.isAbsolute(manifestRelativePath) || path.win32.isAbsolute(manifestRelativePath) || /^[a-zA-Z]:/u.test(manifestRelativePath)) {
    throw new Error("Collection C manifest asset path must be relative");
  }

  const segments = manifestRelativePath.replace(/\\/gu, "/").split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Collection C manifest asset path contains an unsafe segment");
  }

  const root = path.resolve(benchmarkRoot);
  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(root, resolved);
  if (relative.length === 0 || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
    throw new Error("Collection C manifest asset path escaped its benchmark root");
  }
  return resolved;
};
