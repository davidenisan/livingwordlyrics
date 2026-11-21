// Display formatting for song and album titles on the public site: every word
// starts with a capital, and words stored in ALL CAPS are softened
// ("SAINTS COMMUNITY IN SONGS – VOL 13" -> "Saints Community In Songs – Vol 13").
// Words containing digits ("7B", "2x") are left as they are. Display only:
// the stored titles (and the admin editor) are unchanged.
export function displayTitle(value = '') {
  return String(value ?? '')
    .split(/(\s+)/)
    .map((word) => {
      if (!word.trim() || /\d/.test(word)) return word
      const letters = word.replace(/[^\p{L}]/gu, '')
      const shouty = letters.length > 1 && letters === letters.toUpperCase()
      const base = shouty ? word.toLowerCase() : word
      return base.replace(/\p{L}/u, (first) => first.toUpperCase())
    })
    .join('')
}
