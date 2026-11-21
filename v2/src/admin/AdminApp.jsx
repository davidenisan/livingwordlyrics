import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api } from '../api'

import AdminLayout from './components/AdminLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AdminAlbumsPage from './pages/AlbumsPage'
import AdminAlbumPage from './pages/AlbumPage'
import AdminSongPage from './pages/SongPage'

const checkingAccess = <div className="page" style={{ color: 'var(--text-muted)', fontSize: 14 }}>Checking access...</div>

function RequireAdmin({ authed, children }) {
  if (authed === null) return checkingAccess
  if (!authed) return <Navigate to="/admin/login" replace />
  return children
}

// Everything under /admin lives in this lazily loaded module, so public
// visitors never download the admin pages or the rich-text editor.
export default function AdminApp() {
  const [albums, setAlbums] = useState([])
  const [toast, setToast] = useState(null)
  const [adminAuthed, setAdminAuthed] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((message) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const loadAlbums = useCallback(async () => {
    try {
      setAlbums(await api.albums.list())
    } catch {
      setAlbums([])
    }
  }, [])

  const refreshAuth = useCallback(async () => {
    try {
      await api.auth.me()
      setAdminAuthed(true)
    } catch {
      setAdminAuthed(false)
    }
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    if (adminAuthed) loadAlbums()
  }, [adminAuthed, loadAlbums])

  const handleLogout = async () => {
    try {
      await api.auth.logout()
    } catch {
      // noop
    }
    setAdminAuthed(false)
    setAlbums([])
    showToast('Logged out')
  }

  return (
    <>
      <Routes>
        <Route
          path="login"
          element={
            adminAuthed === null
              ? checkingAccess
              : adminAuthed
                ? <Navigate to="/admin" replace />
                : <LoginPage onLoggedIn={refreshAuth} />
          }
        />

        <Route
          element={(
            <RequireAdmin authed={adminAuthed}>
              <AdminLayout albums={albums} onLogout={handleLogout} />
            </RequireAdmin>
          )}
        >
          <Route index element={<DashboardPage albums={albums} />} />
          <Route path="albums" element={<AdminAlbumsPage albums={albums} onRefresh={loadAlbums} showToast={showToast} />} />
          <Route path="albums/:id" element={<AdminAlbumPage onRefresh={loadAlbums} showToast={showToast} />} />
          <Route path="albums/:albumId/songs/:songId" element={<AdminSongPage showToast={showToast} />} />
        </Route>

        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
