import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './moved-banner.css'

// v1 is retired. Tell visitors the app has moved, link to the same page on the
// new site (paths and song/album IDs are the same there), and take them there
// automatically after a short countdown unless they choose to stay.
const NEW_SITE = 'https://livingwordlyrics.pages.dev'
const COUNTDOWN_SECONDS = 10

export default function MovedBanner() {
  const location = useLocation()
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS)
  const [staying, setStaying] = useState(false)
  const target = NEW_SITE + location.pathname + location.search + location.hash

  useEffect(() => {
    if (staying) return undefined
    if (secondsLeft <= 0) {
      window.location.replace(target)
      return undefined
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft, staying, target])

  return (
    <div className="moved-banner" role="status">
      <p>
        <strong>We&apos;ve moved!</strong> Living Word Lyrics now lives at{' '}
        <a href={target}>livingwordlyrics.pages.dev</a>. Please update your bookmarks and home-screen shortcut.
        {!staying && <span className="moved-banner-countdown"> Taking you there in {secondsLeft}s…</span>}
      </p>
      <div className="moved-banner-actions">
        <a className="moved-banner-go" href={target}>Go now</a>
        {!staying && (
          <button type="button" className="moved-banner-stay" onClick={() => setStaying(true)}>
            Stay here
          </button>
        )}
      </div>
    </div>
  )
}
