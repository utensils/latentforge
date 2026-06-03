import * as fs from "node:fs";
import type { PathLike } from "node:fs";
import { IMAGE_EXTS } from "../image/constants.js";

/**
 * Recursively collect image files under a directory.
 */
export function collectImages(dir: string): Array<{ path: string; name: string }> {
  const results: Array<{ path: string; name: string }> = [];

  function walk(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = fs.promises !== undefined ? `${currentPath}/${entry.name}` : joinPath(currentPath, entry.name);
      if (entry.isDirectory()) {
        const childEntries = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const child of childEntries) {
          const childPath = `${fullPath}/${child.name}`;
          if (child.isDirectory()) {
            walkRecursively(childPath);
          } else {
            walkFile(childPath);
          }
        }
      } else {
        walkFile(fullPath);
      }
    }
  }

  function walkRecursively(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walkRecursively(fullPath);
      } else {
        walkFile(fullPath);
      }
    }
  }

  function walkFile(path: string) {
    const stat = fs.statSync(path);
    if (!stat.isFile()) return;
    const ext = getExt(path);
    if (IMAGE_EXTS.has(ext.toLowerCase())) {
      results.push({ path, name: path.split("/").pop() || path });
    }
  }

  function getExt(p: string): string {
    const idx = p.lastIndexOf(".");
    return idx >= 0 ? p.slice(idx) : "";
  }

  function joinPath(a: string, b: string): string {
    return a.endsWith("/") ? a + b : a + "/" + b;
  }

  walk(dir);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Safely check if a path exists.
 */
export function pathExists(p: string): boolean {
  return fs.existsSync(p);
}

/**
 * Recursively create a directory and its parents.
 */
export function mkdirs(rec: string): void {
  fs.mkdirSync(rec, { recursive: true });
}

/**
 * Recursively delete a directory.
 */
export function rmRec(dir: string, opts?: { force?: boolean }): void {
  if (opts?.force && !fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: opts?.force });
}
