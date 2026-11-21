import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Turnstile, captchaConfigured } from '../../shared/captcha'

export const REACTIONS = [
  { key: 'pray', emoji: '🙏', label: 'Amen' },
  { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'praise', emoji: '🙌', label: 'Praise' },
]

// Production builds only offer reactions when a captcha site key is set; the
// matching secret in Supabase Auth is what actually enforces the captcha.
const reactionsEnabled = captchaConfigured || !import.meta.env.PROD

export default function ReactionBar({ songId }) {
  const [counts, setCounts] = useState(null)
  const [mine, setMine] = useState([])
  const [pending, setPending] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | checking (background captcha) | verifying
  const [captchaKey, setCaptchaKey] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCounts(null)
    setMine([])
    setPhase('idle')
    setPending(null)
    setError('')
    api.reactions.counts(songId).then((value) => { if (!cancelled) setCounts(value) }).catch(() => {})
    api.reactions.mine(songId).then((value) => { if (!cancelled) setMine(value) }).catch(() => {})
    return () => { cancelled = true }
  }, [songId])

  if (!reactionsEnabled || counts === null) return null

  const apply = async (key) => {
    const active = !mine.includes(key)
    setBusy(true)
    setError('')
    setMine((current) => (active ? [...current, key] : current.filter((item) => item !== key)))
    setCounts((current) => ({ ...current, [key]: Math.max(0, (current[key] || 0) + (active ? 1 : -1)) }))
    try {
      await api.reactions.set(songId, key, active)
    } catch (err) {
      setMine((current) => (active ? current.filter((item) => item !== key) : [...current, key]))
      setCounts((current) => ({ ...current, [key]: Math.max(0, (current[key] || 0) + (active ? -1 : 1)) }))
      setError(err.message || 'Could not save your reaction.')
    } finally {
      setBusy(false)
    }
  }

  const startSession = async (token, key) => {
    setPhase('verifying')
    setError('')
    try {
      await api.reactions.startSession(token)
      setPhase('idle')
      setPending(null)
      await apply(key)
    } catch (err) {
      failCheck(err)
    }
  }

  const failCheck = (err) => {
    setPhase('idle')
    setPending(null)
    setCaptchaKey((value) => value + 1) // tokens are single-use; next click starts fresh
    setError(err?.message?.includes('captcha') || !err?.message
      ? "We couldn't confirm you're not a bot. Please try again."
      : err.message)
  }

  const handleClick = async (key) => {
    if (busy || phase !== 'idle') return
    const session = await api.reactions.session().catch(() => null)
    if (session) {
      apply(key)
      return
    }
    setError('')
    setPending(key)
    if (captchaConfigured) setPhase('checking') // Turnstile runs in the background
    else startSession(undefined, key) // local development without a captcha
  }

  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const working = phase !== 'idle'

  return (
    <div className="reaction-block">
      <div className="reaction-bar" role="group" aria-label="React to this song" aria-busy={working}>
        {REACTIONS.map((reaction) => {
          const active = mine.includes(reaction.key)
          const count = counts[reaction.key] || 0
          return (
            <button
              key={reaction.key}
              type="button"
              className={`reaction ${active ? 'is-active' : ''} ${pending === reaction.key ? 'is-pending' : ''}`}
              aria-pressed={active}
              aria-label={`${reaction.label}${count ? `, ${count}` : ''}`}
              title={reaction.label}
              onClick={() => handleClick(reaction.key)}
            >
              <span className="reaction-emoji" aria-hidden="true">{reaction.emoji}</span>
              {count > 0 && <span className="reaction-count">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Background bot check (Turnstile invisible mode): no visible widget.
          If Cloudflare ever needs a click, interaction-only shows it here. */}
      {phase === 'checking' && (
        <div className="captcha-background">
          <Turnstile
            key={captchaKey}
            theme={theme}
            appearance="interaction-only"
            onToken={(token) => startSession(token, pending)}
            onExpire={() => failCheck()}
            onError={(err) => failCheck(err)}
          />
        </div>
      )}
      {error && <p className="reaction-note public-status-error" role="alert">{error}</p>}
    </div>
  )
}
