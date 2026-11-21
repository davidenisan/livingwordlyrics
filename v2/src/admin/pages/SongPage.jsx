import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { ChevronLeft, Youtube, Link, Save, Pencil, X, Bold, Italic, Heading2, Heading3, Quote } from 'lucide-react'
import { api } from '../../api'
import ProjectionOverlay from '../../shared/components/ProjectionOverlay'
import { splitLyricLines } from '../../shared/utils/lyrics'

// Shift+Enter starts a new line (paragraph) instead of inserting a hidden
// line break, so every lyric line stays its own block.
const ShiftEnterNewLine = Extension.create({
  name: 'shiftEnterNewLine',
  addKeyboardShortcuts() {
    return { 'Shift-Enter': () => this.editor.commands.splitBlock() }
  },
})

const escapeHtml = (text) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

// Plain-text paste: one paragraph per line; a blank line becomes an empty
// paragraph (the stanza gap used across the library).
const plainTextToLyricsHtml = (text) => text
  .replace(/\r\n?/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .split('\n')
  .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p></p>'))
  .join('')

function LyricsEditor({ value, onChange }) {
  // Headings and quotes apply to whole blocks, so every lyric line must be its
  // own paragraph: songs stored with <br> line breaks are split on load, and
  // pasted text/HTML is split the same way. Hard breaks are disabled.
  const editorRef = useRef(null)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ hardBreak: false }),
      ShiftEnterNewLine,
      Placeholder.configure({ placeholder: 'Add lyrics here... Use headings for Verse, Chorus, Bridge labels.' }),
    ],
    content: splitLyricLines(value || ''),
    editorProps: {
      transformPastedHTML: (html) => splitLyricLines(html),
      handlePaste: (_view, event) => {
        const plain = event.clipboardData?.getData('text/plain')
        const richHtml = event.clipboardData?.getData('text/html')
        if (!plain || richHtml?.trim() || !editorRef.current) return false
        event.preventDefault()
        editorRef.current.chain().focus().insertContent(plainTextToLyricsHtml(plain) || '<p></p>').run()
        return true
      },
    },
    onUpdate: ({ editor: tiptapEditor }) => onChange(tiptapEditor.getHTML()),
  })
  editorRef.current = editor

  if (!editor) return null

  const ToolBtn = ({ onClick, active, children, title }) => (
    <button
      type="button"
      className={`toolbar-btn ${active ? 'active' : ''}`}
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      title={title}
    >
      {children}
    </button>
  )

  return (
    <div className="tiptap-wrapper">
      <div className="tiptap-toolbar">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic size={13} />
        </ToolBtn>
        <div style={{ width: 1, background: 'var(--border)', margin: '2px 4px' }} />
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Section label (Verse, Chorus...)">
          <Heading2 size={13} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Sub-label">
          <Heading3 size={13} />
        </ToolBtn>
        <div style={{ width: 1, background: 'var(--border)', margin: '2px 4px' }} />
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Chorus indent">
          <Quote size={13} />
        </ToolBtn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">↩</ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">↪</ToolBtn>
        </div>
      </div>
      <EditorContent editor={editor} className="tiptap-editor" />
    </div>
  )
}

export default function SongPage({ showToast }) {
  const { albumId, songId } = useParams()
  const navigate = useNavigate()
  const [song, setSong] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [projectionMode, setProjectionMode] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const loadedSong = await api.songs.get(songId)
      setSong(loadedSong)
      setForm({
        title: loadedSong.title,
        track_number: loadedSong.track_number ?? '',
        lyrics: loadedSong.lyrics ?? '',
        youtube_url: loadedSong.youtube_url ?? '',
        lwm_url: loadedSong.lwm_url ?? '',
        songwriters: loadedSong.songwriters ?? '',
      })
    } catch {
      navigate(`/admin/albums/${albumId}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [songId])

  useEffect(() => {
    if (!projectionMode) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
        setProjectionMode(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [projectionMode])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.songs.update(songId, form)
      showToast('Song saved')
      setEditing(false)
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setForm({
      title: song.title,
      track_number: song.track_number ?? '',
      lyrics: song.lyrics ?? '',
      youtube_url: song.youtube_url ?? '',
      lwm_url: song.lwm_url ?? '',
      songwriters: song.songwriters ?? '',
    })
    setEditing(false)
  }

  if (loading) return <div className="page" style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>
  if (!song) return null

  return (
    <div className="page">
      <div className="breadcrumb">
        <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => navigate('/admin/albums')}>
          <ChevronLeft size={14} /> Albums
        </span>
        <span className="breadcrumb-sep">/</span>
        <span style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/albums/${albumId}`)}>{song.album_title}</span>
        <span className="breadcrumb-sep">/</span>
        <span>{song.title}</span>
      </div>

      <div className="song-detail-header">
        <div>
          {editing ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <input
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                style={{ fontSize: 22, fontFamily: "'EB Garamond', Georgia, serif", fontWeight: 600, width: 'auto', minWidth: 280 }}
              />
              <input
                type="number"
                value={form.track_number}
                onChange={(event) => set('track_number', event.target.value)}
                placeholder="Track #"
                style={{ width: 90 }}
              />
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 26, marginBottom: 6 }}>
                {song.track_number && <span style={{ color: 'var(--text-light)', fontSize: 18, marginRight: 8 }}>{song.track_number}.</span>}
                {song.title}
              </h1>
              {song.songwriters && <p className="songwriters-meta">Words &amp; Music: {song.songwriters}</p>}
            </>
          )}

          <div className="song-links">
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Youtube size={15} style={{ color: '#b91c1c', flexShrink: 0 }} />
                  <input placeholder="YouTube URL" value={form.youtube_url} onChange={(event) => set('youtube_url', event.target.value)} style={{ width: 340 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    placeholder="Songwriters (comma-separated)"
                    value={form.songwriters}
                    onChange={(event) => set('songwriters', event.target.value)}
                    style={{ width: 340 }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Link size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <input placeholder="Living Word Media URL" value={form.lwm_url} onChange={(event) => set('lwm_url', event.target.value)} style={{ width: 340 }} />
                </div>
              </div>
            ) : (
              <>
                {song.youtube_url && (
                  <a href={song.youtube_url} target="_blank" rel="noopener noreferrer" className="link-btn link-btn-yt">
                    <Youtube size={13} /> YouTube
                  </a>
                )}
                {song.lwm_url && (
                  <a href={song.lwm_url} target="_blank" rel="noopener noreferrer" className="link-btn link-btn-lwm">
                    <Link size={13} /> Living Word Media
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {editing ? (
            <>
              <button className="btn btn-secondary" onClick={handleCancel}><X size={14} /> Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setProjectionMode(true)}>Projection mode</button>
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit
              </button>
            </>
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-light)', marginBottom: 10 }}>
          Lyrics
        </div>

        {editing ? (
          <LyricsEditor value={form.lyrics} onChange={(value) => set('lyrics', value)} />
        ) : song.lyrics ? (
          <div className="lyrics-view" dangerouslySetInnerHTML={{ __html: song.lyrics }} />
        ) : (
          <div className="lyrics-view">
            <span className="lyrics-empty">No lyrics yet. Click Edit to add them.</span>
          </div>
        )}
      </div>

      {projectionMode && <ProjectionOverlay html={song.lyrics} onClose={() => setProjectionMode(false)} />}
    </div>
  )
}
