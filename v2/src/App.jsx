import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import PublicLayout from './public/components/PublicLayout'
import HomePage from './public/pages/HomePage'
import AlbumViewPage from './public/pages/AlbumViewPage'
import SongViewPage from './public/pages/SongViewPage'

const AdminApp = lazy(() => import('./admin/AdminApp'))

const adminFallback = <div className="page" style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading admin...</div>

export default function App() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={(
          <Suspense fallback={adminFallback}>
            <AdminApp />
          </Suspense>
        )}
      />

      <Route path="/" element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="songs/:id" element={<SongViewPage />} />
        <Route path="albums" element={<Navigate to="/" replace />} />
        <Route path="albums/:id" element={<AlbumViewPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
