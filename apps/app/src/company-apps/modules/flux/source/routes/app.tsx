import { Outlet, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { LandingPage } from '@flux/components/landing/landing-page'
import { useAuth } from '@flux/lib/supabase/auth'
import { isFluxEmbedded } from '@flux/lib/connect-bridge'

export const Route = createFileRoute('/app')({
  component: AppLayout,
})

function isDemo(): boolean {
  if (typeof window === 'undefined') return false
  // Company apps use Connect authentication and their own storage namespace.
  if (isFluxEmbedded() || window.location.pathname.startsWith('/company/')) return true
  return localStorage.getItem('flux_demo') === '1'
}

function AppLayout() {
  const auth = useAuth()
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    setDemo(isDemo())
  }, [])

  // 1) Signed in -> show the app shell (children render)
  if (auth.status.kind === 'signed_in') return <Outlet />
  // 2) Demo mode -> show the app shell without auth
  if (demo) return <Outlet />
  // 3) Not authed + no demo -> show the landing page
  //    (includes the 'loading' state, so we never block on Supabase init)
  return <LandingPage />
}
