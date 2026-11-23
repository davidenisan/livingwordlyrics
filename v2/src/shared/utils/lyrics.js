export function htmlToPlainLyrics(html = '') {
  return decodeHtmlEntities(String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h2|h3|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim())
}

export function hasUsableLyrics(lyrics = '') {
  const plain = htmlToPlainLyrics(String(lyrics)).toLowerCase().replace(/\s+/g, ' ').trim()

  if (!plain) return false
  if (plain.includes('no lyrics for this yet')) return false
  if (plain.includes('no lyrics yet')) return false

  return true
}

export function lyricsSnippet(html = '', length = 140) {
  const text = htmlToPlainLyrics(html).replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= length) return text
  return `${text.slice(0, length).trim()}...`
}

export function decodeHtmlEntities(value = '') {
  const text = String(value)

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = text
    return textarea.value
  }

  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// Search ignores apostrophes, so "Gods", "God's" and "God\u2019s" are the same
// word (matches search_fold() in supabase/migrations/004).
const APOSTROPHES = /['\u2018\u2019\u02bc`]/g
const foldApostrophes = (value) => value.replace(APOSTROPHES, '').toLowerCase()

export function searchTerms(query = '') {
  const normalized = foldApostrophes(decodeHtmlEntities(query)).match(/[a-z0-9]+/gi) || []
  return [...new Set(normalized.filter((term) => term.length > 1))]
}

// Regex source for a folded term that tolerates an apostrophe after any
// character, so "gods" finds "God's" in the original text.
function termPattern(term) {
  return [...term].map(escapeRegExp).join("['\u2018\u2019\u02bc`]?")
}

export function highlightText(value = '', query = '') {
  const text = decodeHtmlEntities(value)
  const terms = searchTerms(query)

  if (!text || terms.length === 0) return [{ text, match: false }]

  const pattern = new RegExp(`(${terms.map(termPattern).join('|')})`, 'gi')
  return text.split(pattern).filter(Boolean).map((part) => ({
    text: part,
    match: terms.includes(foldApostrophes(part)),
  }))
}

export function searchMatchSnippet(html = '', query = '', length = 180) {
  const text = htmlToPlainLyrics(html).replace(/\s+/g, ' ').trim()
  const terms = searchTerms(query)

  if (!text) return { segments: [], prefix: '', suffix: '' }

  const firstMatch = terms.reduce((best, term) => {
    const index = text.search(new RegExp(termPattern(term), 'i'))
    if (index === -1) return best
    return best === -1 ? index : Math.min(best, index)
  }, -1)

  const start = firstMatch === -1 ? 0 : Math.max(0, firstMatch - Math.floor(length / 3))
  const end = Math.min(text.length, start + length)
  const snippet = text.slice(start, end).trim()

  return {
    segments: highlightText(snippet, query),
    prefix: start > 0 ? '...' : '',
    suffix: end < text.length ? '...' : '',
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Editor helper (browser only): headings and quotes apply to whole blocks, so
// every lyric line must be its own paragraph. Splits paragraphs (and
// headings) that contain <br> line breaks into one block per line; a blank
// line (two breaks) becomes an empty paragraph, the stanza gap used across
// the library. Trailing breaks are dropped.
export function splitLyricLines(html = '') {
  if (!html || !/<br\s*\/?>/i.test(html) || typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

  doc.body.querySelectorAll('p, h1, h2, h3, h4').forEach((block) => {
    if (!block.querySelector('br')) return
    const lines = [[]]
    for (const node of [...block.childNodes]) {
      if (node.nodeName === 'BR') lines.push([])
      else lines[lines.length - 1].push(node)
    }
    while (lines.length > 1 && !lines[lines.length - 1].some((node) => node.textContent.trim())) lines.pop()

    const replacements = lines.map((nodes) => {
      const hasText = nodes.some((node) => node.textContent.trim())
      const element = doc.createElement(hasText ? block.nodeName.toLowerCase() : 'p')
      if (hasText) nodes.forEach((node) => element.appendChild(node))
      return element
    })
    block.replaceWith(...replacements)
  })

  return doc.body.innerHTML
}
