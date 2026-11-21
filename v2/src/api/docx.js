// Loaded on demand by api.albums.importDocx so the DOCX parser (and mammoth)
// stay out of the public bundle.
export { parseSongsFromDocx } from '../../src-supabase-prototype/docx'

export function fileFromBase64(value, filename) {
  const raw = String(value).includes(',') ? String(value).split(',').pop() : String(value)
  const bytes = Uint8Array.from(atob(raw), (character) => character.charCodeAt(0))
  return new File([bytes], filename || 'songs.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}
