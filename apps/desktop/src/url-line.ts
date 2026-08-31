/**
 * Parser for the `dsh web` readiness line. The web app prints exactly one
 * `dsh web: <authenticated url>` line once the tree has settled and the
 * server accepts requests; the desktop shell treats that line as both the
 * readiness signal and the source of the tokenized URL it must load.
 */

/** Matches the readiness line; group 1 is the candidate URL token. */
const URL_LINE = /^dsh web: (\S+)/

/**
 * Extract the authenticated Web GUI URL from one stdout line.
 *
 * @param line - one line of `dsh web` stdout, without the trailing newline.
 * @returns the parsed http(s) URL, or undefined when the line is not the readiness line.
 */
export function parseWebUrlLine(line: string): URL | undefined {
  const match = URL_LINE.exec(line)
  if (match === null) return undefined
  const candidate = match[1]
  if (candidate === undefined || !URL.canParse(candidate)) return undefined
  const url = new URL(candidate)
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined
}
