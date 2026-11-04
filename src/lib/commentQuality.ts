// Basic, explainable comment checks used only to decide whether a comment
// earns CP. They never block posting, and they cannot tell whether a comment
// is thoughtful. They only catch the obvious cases found in the audit.

export const MIN_COMMENT_LENGTH = 12
export const MIN_DISTINCT_WORDS = 3

export type CommentIssue = 'tooShort' | 'repeatedChars' | 'repeatedWords' | 'duplicate' | 'spam'

export const COMMENT_ISSUE_TEXT: Record<CommentIssue, string> = {
  tooShort: `Comments need at least ${MIN_COMMENT_LENGTH} characters to earn CP.`,
  repeatedChars: 'Comments made mostly of one repeated character do not earn CP.',
  repeatedWords: `Comments need at least ${MIN_DISTINCT_WORDS} different words and cannot repeat the same word over and over.`,
  duplicate: 'You have already posted this comment, so it does not earn CP again.',
  spam: 'Comments with links or self promotion such as "follow me" do not earn CP.',
}

const SPAM_PATTERNS = [
  /https?:\/\//i,
  /\bwww\./i,
  /\b[a-z0-9-]+\.(com|net|org|io|ly|co|xyz|info)\b/i,
  /\bfollow (me|back|4 ?follow)\b/i,
  /\bcheck (out )?my (page|profile|channel)\b/i,
  /\bdm me\b/i,
  /\bclick (here|the link)\b/i,
  /\bfree (followers|money|gift)\b/i,
]

/** Lowercase, strip punctuation and collapse whitespace, for duplicate checks. */
export function normalizeComment(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(text: string): string[] {
  return normalizeComment(text).split(' ').filter(Boolean)
}

/**
 * Returns the first problem that stops a comment from earning CP, or null.
 * `previous` is the fan's earlier comments (any post).
 */
export function assessComment(text: string, previous: string[] = []): CommentIssue | null {
  const trimmed = text.trim()
  if (trimmed.length < MIN_COMMENT_LENGTH) return 'tooShort'

  if (SPAM_PATTERNS.some((re) => re.test(trimmed))) return 'spam'

  // Repeated characters: very few distinct letters or digits, or a long run of one character.
  const chars = trimmed.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const distinctChars = new Set(chars).size
  if (chars.length === 0 || distinctChars < 4 || /(.)\1{6,}/u.test(trimmed)) return 'repeatedChars'

  // Repeated words: too few different words, or one word dominating a longer comment.
  const w = words(trimmed)
  const distinct = new Set(w)
  if (distinct.size < MIN_DISTINCT_WORDS) return 'repeatedWords'
  const counts = new Map<string, number>()
  for (const word of w) counts.set(word, (counts.get(word) ?? 0) + 1)
  const top = Math.max(...counts.values())
  if (w.length >= 6 && top / w.length > 0.5) return 'repeatedWords'

  const norm = normalizeComment(trimmed)
  if (previous.some((p) => normalizeComment(p) === norm)) return 'duplicate'

  return null
}
