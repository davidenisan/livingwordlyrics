import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { Turnstile, captchaConfigured } from '../../shared/captcha'

export default function LoginPage({ onLoggedIn }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Supabase Auth requires a captcha token on every sign-in once captcha
  // protection is on. Tokens are single-use, so the widget resets after a try.
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (captchaConfigured && !captchaToken) {
      setError('Still checking your browser. Please try again in a moment.')
      return
    }
    setError('')
    setLoading(true)

    try {
      await api.auth.login({ ...form, captchaToken })
      await onLoggedIn()
      navigate('/admin')
    } catch (err) {
      setError(err.message || 'Login failed')
      setCaptchaToken('')
      setCaptchaKey((value) => value + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Admin Login</h1>
        <p>Manage albums and songs for Living Word Lyrics.</p>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" value={form.username} onChange={(event) => set('username', event.target.value)} autoComplete="username" />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(event) => set('password', event.target.value)}
            autoComplete="current-password"
          />
        </div>

        {captchaConfigured && (
          <div className="form-group">
            <Turnstile
              key={captchaKey}
              theme="light"
              appearance="interaction-only"
              onToken={setCaptchaToken}
              onExpire={() => setCaptchaToken('')}
              onError={(err) => setError(err.message)}
            />
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
