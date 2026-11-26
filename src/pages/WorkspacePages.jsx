import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { LogoutButton } from '../components/layout/AppLayout.jsx'
import IrisAssistant from '../components/ui/IrisAssistant.jsx'
import { LoadingSignal } from '../components/ui/HudVisuals.jsx'
import { PageHeading } from '../components/ui/WorkspaceUI.jsx'
import { supabase } from '../lib/supabase.js'

export function AIInsights() {
  return <>
    <PageHeading title="AI Insights" description="I.R.I.S. provides workspace guidance. Personalised analysis is planned for a future module." />
    <IrisAssistant initiallyOpen />
  </>
}

export function Profile() {
  const { user, displayName } = useOutletContext()
  return <ProfileDetails key={user.id} user={user} displayName={displayName} />
}

function ProfileDetails({ user, displayName }) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data, error } = await supabase.from('profiles')
          .select('full_name,target_role,target_salary_lpa').eq('id', user.id).maybeSingle()
        if (error) throw error
        if (active) setResult({ data })
      } catch {
        if (active) setResult({ error: true })
      }
    }
    void load()
    return () => { active = false }
  }, [user.id])

  return <>
    <PageHeading title="Profile" description="View your account and career details." />
    <section className="ws-card">
      <dl className="ws-details">
        <div><dt>Name</dt><dd>{result?.data?.full_name || displayName}</dd></div>
        <div><dt>Email</dt><dd>{user.email}</dd></div>
        {result?.data && <>
          <div><dt>Target role</dt><dd>{result.data.target_role || 'Not set'}</dd></div>
          <div><dt>Target salary</dt><dd>{result.data.target_salary_lpa == null ? 'Not set' : `${result.data.target_salary_lpa} LPA`}</dd></div>
        </>}
      </dl>
      {!result && <LoadingSignal>Loading profile details…</LoadingSignal>}
      {result?.error && <p role="alert" className="ws-error">Profile details could not be loaded. Verify the database setup and your connection.</p>}
      {result && !result.error && !result.data && <p>No profile record was found. Check the profile backfill.</p>}
    </section>
  </>
}

export function Settings() {
  const { user, displayName, logout, pending, error } = useOutletContext()
  return <>
    <PageHeading title="Settings" description="Manage your current session." />
    <section className="ws-card">
      <h2>Signed-in account</h2>
      <dl className="ws-details">
        <div><dt>Name</dt><dd>{displayName}</dd></div>
        <div><dt>Email</dt><dd>{user.email}</dd></div>
      </dl>
      <LogoutButton pending={pending} logout={logout} />
      {error && <p className="ws-error" role="alert">{error}</p>}
    </section>
  </>
}
