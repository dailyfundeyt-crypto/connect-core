import { useEffect, useState, type ReactNode } from 'react'
import { AppSidebar } from './app-sidebar'
import { AppTopbar } from './app-topbar'
import { MobileBottomBar } from './mobile-bottom-bar'
import { SettingsDrawer } from './settings-drawer'

type Props = {
  children: ReactNode
  activeProduct?: string | null
  searchPlaceholder?: string
  showSidebar?: boolean
}

export function AppShell({
  children,
  activeProduct = null,
  searchPlaceholder,
  showSidebar = true,
}: Props) {
  const embeddedInConnect = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/company/') ||
    Boolean(document.querySelector('[data-connect-company-app="true"]'))
  )
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Reagiere auf den Hamburger-Button in der Topbar / der Bottom-Bar
  useEffect(() => {
    const handler = () => setMobileSidebarOpen((v) => !v)
    window.addEventListener('flux:toggle-sidebar', handler)
    return () => window.removeEventListener('flux:toggle-sidebar', handler)
  }, [])

  return (
    <div className={`relative flex ${embeddedInConnect ? 'h-full min-h-0' : 'min-h-screen'} bg-[#03060d] text-white`}>
      {showSidebar && (
        <>
          {/* Mobile backdrop — klick schließt die Sidebar */}
          {mobileSidebarOpen && (
            <button
              type="button"
              aria-label="Sidebar schließen"
              onClick={() => setMobileSidebarOpen(false)}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
            />
          )}

          {/* Sidebar — auf md+ als feste Spalte, auf Mobile als Off-Canvas Drawer */}
          <div
            className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 md:static md:translate-x-0 ${
              mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <AppSidebar
              collapsed={collapsed}
              onToggle={() => setCollapsed((v) => !v)}
              activeProduct={activeProduct}
              onOpenSettings={() => {
                setSettingsOpen(true)
                setMobileSidebarOpen(false)
              }}
            />
          </div>
        </>
      )}
      <div className={`flex min-w-0 ${embeddedInConnect ? 'min-h-0' : 'min-h-screen'} flex-1 flex-col`}>
        <AppTopbar
          {...(searchPlaceholder ? { searchPlaceholder } : {})}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {/* pb-24 = Platz für die Mobile-Bottom-Bar (nur Mobile, auf md+ wieder pb-12) */}
        <main className={embeddedInConnect
          ? 'min-h-0 flex-1 overflow-y-auto bg-[#08090d] px-5 py-5 lg:px-8'
          : 'flex-1 overflow-y-auto bg-[#08090d] px-6 pb-24 pt-8 md:pb-12 lg:px-10'}>
          {children}
        </main>
      </div>
      <>
        <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <MobileBottomBar
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleSidebar={() => setMobileSidebarOpen((v) => !v)}
        />
      </>
    </div>
  )
}
