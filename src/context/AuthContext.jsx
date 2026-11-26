import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let receivedAuthEvent = false

    function updateSession(nextSession) {
      setSession(nextSession)
      setLoading(false)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return
        receivedAuthEvent = true
        updateSession(nextSession)
      },
    )

    async function restoreSession() {
      let restoredSession = null
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!error) restoredSession = data.session
      } catch {
        // A failed startup check falls back to the signed-out state.
      }

      // A newer auth event takes precedence over the startup snapshot.
      if (active && !receivedAuthEvent) updateSession(restoredSession)
    }

    void restoreSession()

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components -- Keep the consumer hook beside its provider.
export function useAuth() {
  return useContext(AuthContext)
}
