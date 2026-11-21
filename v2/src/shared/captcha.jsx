import { useEffect, useRef } from 'react'

// Cloudflare Turnstile. The site key is public (it ships in the page); the
// secret lives only in Supabase Auth, which verifies every captcha token.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''
export const captchaConfigured = Boolean(TURNSTILE_SITE_KEY)

let scriptPromise = null

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Captcha failed to load')))
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Captcha failed to load. Check your connection and try again.'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function Turnstile({ onToken, onExpire, onError, theme = 'auto', appearance = 'always' }) {
  const container = useRef(null)
  const handlers = useRef({ onToken, onExpire, onError })
  handlers.current = { onToken, onExpire, onError }

  useEffect(() => {
    if (!captchaConfigured) return undefined
    let widgetId = null
    let cancelled = false

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return
        widgetId = turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme,
          appearance,
          callback: (token) => handlers.current.onToken?.(token),
          'expired-callback': () => handlers.current.onExpire?.(),
          'error-callback': () => handlers.current.onError?.(new Error('Captcha check failed. Please try again.')),
        })
      })
      .catch((error) => handlers.current.onError?.(error))

    return () => {
      cancelled = true
      if (widgetId !== null) window.turnstile?.remove(widgetId)
    }
  }, [theme, appearance])

  return <div ref={container} className="turnstile-slot" />
}
