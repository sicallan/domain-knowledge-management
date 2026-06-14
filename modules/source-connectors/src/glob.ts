/**
 * Minimal, dependency-free glob matcher covering the subset Phase 1 filters need:
 *   `*`  — any run of characters except a path separator
 *   `**` — any run of characters including path separators; a leading double-star
 *          directory segment also matches zero intervening directories
 *   `?`  — a single character except a path separator
 * Everything else is matched literally. Adding the wider glob surface later is an
 * additive change behind this single function (OCP).
 */
export function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]!;
    if (ch === "*") {
      const isDouble = pattern[i + 1] === "*";
      if (isDouble) {
        i += 1;
        // A `**/` segment collapses to an optional path prefix so it also
        // matches when zero intermediate directories are present.
        if (pattern[i + 1] === "/") {
          i += 1;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchGlob(pattern: string, value: string): boolean {
  return globToRegExp(pattern).test(value);
}
