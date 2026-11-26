import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Brand from './Brand.jsx'
import { supabase } from '../lib/supabase.js'

const initialFields = { fullName: '', email: '', password: '', confirmation: '' }

function requestError(error, isRegister) {
  switch (error.code) {
    case 'invalid_credentials':
      return 'The email or password is incorrect.'
    case 'email_not_confirmed':
      return 'Confirm your email before signing in. Check your inbox for the confirmation link.'
    case 'weak_password':
      return 'Choose a stronger password and try again.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a moment and try again.'
    default:
      if (error.name === 'AuthRetryableFetchError' || error instanceof TypeError) {
        return 'Could not reach the authentication service. Check your connection and try again.'
      }
      return isRegister
        ? 'Could not create your account. If you already have one, try signing in.'
        : 'Could not sign in. Try again.'
  }
}

export default function AuthForm({ isRegister = false }) {
  const { hash } = useLocation()
  const [fields, setFields] = useState(initialFields)
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const confirmationFailed = !isRegister && new URLSearchParams(hash.slice(1)).has('error_code')

  function changeField(event) {
    const { name, value } = event.target
    setFields((current) => ({ ...current, [name]: value }))
    setError('')
    setNotice('')
  }

  async function submit(event) {
    event.preventDefault()
    if (pending) return

    setError('')
    setNotice('')
    const fullName = fields.fullName.trim()
    const email = fields.email.trim()
    const { password, confirmation } = fields

    if (!email || !password || (isRegister && (!fullName || !confirmation))) {
      setError('Complete all required fields.')
      return
    }
    if (event.currentTarget.elements.email.validity.typeMismatch) {
      setError('Enter a valid email address.')
      return
    }
    if (isRegister && password.length < 8) {
      setError('Use at least eight characters for your password.')
      return
    }
    if (isRegister && password !== confirmation) {
      setError('Passwords must match.')
      return
    }

    setPending(true)
    try {
      if (isRegister) {
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: new URL('/login', window.location.origin).href,
          },
        })
        if (signupError) throw signupError
        if (!data.session) {
          setFields({ ...initialFields, fullName, email })
          setShowPassword(false)
          setNotice('Check your inbox for a confirmation link to finish creating your account.')
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
        if (loginError) throw loginError
      }
      // The auth listener updates the session and the guest route redirects.
    } catch (authError) {
      setError(requestError(authError, isRegister))
    } finally {
      setPending(false)
    }
  }

  const passwordType = showPassword ? 'text' : 'password'

  return (
    <main className="auth-layout">
      <Brand />
      <section className="card auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p>{isRegister ? 'Start building your interview workspace.' : 'Sign in to your interview workspace.'}</p>
        <form onSubmit={submit} noValidate>
          <fieldset disabled={pending}>
            {isRegister && (
              <label className="field">
                Full name
                <input name="fullName" autoComplete="name" value={fields.fullName} onChange={changeField} required />
              </label>
            )}
            <label className="field">
              Email address
              <input name="email" type="email" autoComplete="email" value={fields.email} onChange={changeField} required />
            </label>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-row">
                <input id="password" name="password" type={passwordType}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  minLength={isRegister ? 8 : undefined} value={fields.password} onChange={changeField} required />
                <button className="button secondary password-toggle" type="button" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
              </div>
            </div>
            {isRegister && (
              <label className="field">
                Confirm password
                <input name="confirmation" type={passwordType} autoComplete="new-password"
                  value={fields.confirmation} onChange={changeField} required />
              </label>
            )}
            <button className="button auth-submit" type="submit">
              {isRegister ? (pending ? 'Creating account...' : 'Register') : (pending ? 'Signing in...' : 'Log in')}
            </button>
          </fieldset>
          {error && <p className="feedback error" role="alert">{error}</p>}
          {notice && <p className="feedback success" role="status">{notice}</p>}
          {confirmationFailed && !error && (
            <p className="feedback error" role="alert">This confirmation link is invalid or expired. Try registering again or sign in if you already confirmed your email.</p>
          )}
        </form>
        <p className="auth-footer">
          {isRegister ? 'Already have an account? ' : 'New to InterTrap? '}
          <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Log in' : 'Get started'}</Link>
        </p>
      </section>
    </main>
  )
}
