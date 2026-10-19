/**
 * Connect-Wrapper für https://github.com/dailyfundeyt-crypto/dailyfun.
 *
 * 1:1 aus dem dailyfun-Repo übernommen (pages, components, contexts, hooks, lib,
 * utils, integrations) – jede Datei steht unverändert in apps/app/src/dailyfun/.
 * Was hier passiert, ist nur das, was Connect drumherum braucht:
 *   • MemoryRouter (kein BrowserRouter), damit täglich-interne Routen
 *     (`/`, `/profile/:userId`, `/messages`, …) Connect's TanStack-Router
 *     nicht in die Quere kommen — Connect-URL bleibt stabil.
 *   • Variant „panel“: rendert täglich als rechtes Panel im Connect-Main-
 *     bereich. AppSidebar ist die innere Spalte (Navigation), daneben der
 *     Inhalt. Connect's AppSidebar sitzt außerhalb und bleibt sichtbar.
 *   • Variant „page“: rendert täglich als Vollbild-App (Connect-Sidebar wird
 *     vom Aufrufer ausgeblendet), mit AppSidebar links und Inhalt daneben.
 *
 * Aufruf via `apps/app/src/company-apps/modules/dailyfun/app.tsx` (panel) und
 * `apps/app/src/routes/_authed/_app/firmenprofil.tsx` (page, Fallback).
 */
import { Suspense, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation as useDailyfunLocation,
  useNavigationType as useDailyfunNavigationType,
  useNavigate as useDailyfunNavigate,
} from "react-router-dom";
import { Toaster } from "@dailyfun/components/ui/toaster";
import { Toaster as Sonner } from "@dailyfun/components/ui/sonner";
import { TooltipProvider } from "@dailyfun/components/ui/tooltip";
import { SidebarProvider } from "@dailyfun/components/ui/sidebar";
import { AuthProvider } from "@dailyfun/contexts/AuthContext";
import { LanguageProvider } from "@dailyfun/contexts/LanguageContext";
import { ThemeProvider } from "@dailyfun/contexts/ThemeContext";
import { GradientProvider } from "@dailyfun/contexts/GradientContext";
import { AppSidebar } from "@dailyfun/components/AppSidebar";
import { AnimatedBackground } from "@dailyfun/components/AnimatedBackground";
import Header from "@dailyfun/components/Header";
import MobileBottomNav from "@dailyfun/components/MobileBottomNav";

import Search from "@dailyfun/pages/Search";
import Article from "@dailyfun/pages/Article";
import AboutUs from "@dailyfun/pages/AboutUs";
import Products from "@dailyfun/pages/Products";
import CategoryPage from "@dailyfun/pages/CategoryPage";
import ProfileManagement from "@dailyfun/pages/ProfileManagement";
import Profile from "@dailyfun/pages/Profile";
import Contact from "@dailyfun/pages/Contact";
import SocialMedia from "@dailyfun/pages/SocialMedia";
import PrivacyPolicy from "@dailyfun/pages/PrivacyPolicy";
import TermsOfService from "@dailyfun/pages/TermsOfService";
import AI from "@dailyfun/pages/AI";
import Auth from "@dailyfun/pages/Auth";
import CreateArticle from "@dailyfun/pages/CreateArticle";
import Messages from "@dailyfun/pages/Messages";
import Analytics from "@dailyfun/pages/Analytics";
import Community from "@dailyfun/pages/Community";
import NotFound from "@dailyfun/pages/NotFound";

const queryClient = new QueryClient();

type ConnectVariant = "panel" | "page";

function DailyfunApp({ variant }: { variant: ConnectVariant }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <ThemeProvider>
            <GradientProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <MemoryRouter initialEntries={["/"]}>
                  <ScrollToTop />
                  <ExposeNavigate />
                  <SidebarProvider defaultOpen={true}>
                    <div
                      className={
                        variant === "panel"
                          ? "flex w-full min-h-0 flex-1 bg-background relative overflow-hidden"
                          : "min-h-screen flex w-full bg-background relative"
                      }
                    >
                        {variant === "page" ? <AnimatedBackground /> : null}
                        <AppSidebar />
                        <div
                          className={
                            variant === "panel"
                              ? "flex min-h-0 flex-1 flex-col relative z-10 overflow-hidden"
                              : "flex flex-col flex-1 w-full relative z-10"
                          }
                        >
                          {variant === "page" ? <Header /> : null}
                          <main
                            className={
                              variant === "panel"
                                ? "flex-1 min-h-0 overflow-y-auto"
                                : "flex-1 pb-16 md:pb-0"
                            }
                          >
                            <Routes>
                              <Route path="/" element={<Search />} />
                              <Route path="/search" element={<Search />} />
                              <Route path="/about" element={<AboutUs />} />
                              <Route path="/products" element={<Products />} />
                              <Route path="/contact" element={<Contact />} />
                              <Route
                                path="/social-media"
                                element={<SocialMedia />}
                              />
                              <Route
                                path="/privacy-policy"
                                element={<PrivacyPolicy />}
                              />
                              <Route
                                path="/terms-of-service"
                                element={<TermsOfService />}
                              />
                              <Route path="/ai" element={<AI />} />
                              <Route path="/auth" element={<Auth />} />
                              <Route
                                path="/article/:id"
                                element={<Article />}
                              />
                              <Route
                                path="/weird"
                                element={<ProfileManagement />}
                              />
                              <Route
                                path="/profile/:userId"
                                element={<Profile />}
                              />
                              <Route
                                path="/create-article"
                                element={<CreateArticle />}
                              />
                              <Route path="/messages" element={<Messages />} />
                              <Route
                                path="/analytics"
                                element={<Analytics />}
                              />
                              <Route path="/community" element={<Community />} />
                              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </main>
                        {variant === "page" ? <MobileBottomNav /> : null}
                      </div>
                    </div>
                  </SidebarProvider>
                </MemoryRouter>
              </TooltipProvider>
            </GradientProvider>
          </ThemeProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function ScrollToTop() {
  const location = useDailyfunLocation();
  const navigationType = useDailyfunNavigationType();
  useEffect(() => {
    const shouldRestore = (location.state as { restoreScroll?: boolean } | null)?.restoreScroll;
    if (navigationType === "PUSH" && !shouldRestore) {
      window.scrollTo(0, 0);
    }
  }, [location, navigationType]);
  return null;
}

/**
 * Stellt dailyfuns `useNavigate` an einem window-Property bereit, damit
 * eingehende `<a>`-Klicks an den MemoryRouter weitergeleitet werden
 * können, ohne dass die Browser-URL angefasst wird. So kollidiert
 * täglich-Routing nie mit dem äußeren TanStack-Router.
 */
function ExposeNavigate() {
  const navigate = useDailyfunNavigate();
  useEffect(() => {
    (window as unknown as { __dailyfunNavigate?: (to: string) => void }).__dailyfunNavigate = (to) => navigate(to);
    return () => {
      delete (window as unknown as { __dailyfunNavigate?: (to: string) => void }).__dailyfunNavigate;
    };
  }, [navigate]);
  return null;
}

/**
 * Standard-Export: rendert dailyfun als rechtes Panel im Connect-Main-
 * bereich. Wird vom CompanyAppWorkspace aufgerufen, der bereits einen
 * flex-Container bereitstellt. Connect-Sidebar ist außerhalb dieses
 * Containers und bleibt sichtbar.
 */
export default function DailyfunPanelApp() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  useDailyfunLinkTrap(shellRef);
  return (
    <div
      ref={shellRef}
      className="connect-dailyfun-shell flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
      data-dailyfun-shell="true"
    >
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background text-foreground">
            <p className="text-sm text-muted-foreground">Firmenprofil wird geladen…</p>
          </div>
        }
      >
        <DailyfunApp variant="panel" />
      </Suspense>
    </div>
  );
}

/**
 * Vollbild-Mount (z. B. über die `/firmenprofil`-Top-Level-Route). Wird
 * nicht mehr im Company-Switcher-Flow benutzt, aber bleibt als Fallback
 * erhalten, falls jemand die Direkt-URL aufruft.
 */
export function DailyfunPageApp() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  useDailyfunLinkTrap(shellRef);
  return (
    <div
      ref={shellRef}
      className="connect-dailyfun-shell fixed inset-0 z-[100] overflow-y-auto bg-background text-foreground isolate"
      data-dailyfun-shell="true"
    >
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background text-foreground">
            <p className="text-sm text-muted-foreground">dailyfun wird geladen…</p>
          </div>
        }
      >
        <DailyfunApp variant="page" />
      </Suspense>
    </div>
  );
}

/**
 * Hängt einen capture-phase Click-Handler an den dailyfun-Shell-Container,
 * der alle `<a>`-Klicks abfängt, die nicht-modale Links sind (kein `target`,
 * kein `download`, kein modifier-key). Statt den Browser navigieren zu
 * lassen (was Connect oder den History-Stack durcheinanderbringen würde),
 * delegiert er an dailyfuns MemoryRouter-`navigate`. Damit lädt jede
 * `Link`-Komponente im dailyfun-Code ohne weitere Anpassung den passenden
 * Inhalt, und die Connect-URL bleibt stabil.
 */
function useDailyfunLinkTrap(shellRef: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;

    const handleClick = (event: MouseEvent) => {
      // Nur primäre Maustaste, keine Modifier-Keys
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      // Anchor hochwandern (kann in <svg>, <button> etc. verschachtelt sein)
      const path = event.composedPath();
      let anchor: HTMLAnchorElement | null = null;
      for (const node of path) {
        if (node instanceof HTMLAnchorElement) {
          anchor = node;
          break;
        }
      }
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.hasAttribute("rel") && /\bexternal\b/.test(anchor.rel)) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      // Externe Links, mailto:, tel:, javascript:, #fragment → durchlassen
      if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(href)) return;

      // Interne dailyfun-Routen an den MemoryRouter weiterreichen
      event.preventDefault();
      event.stopPropagation();
      try {
        const pathOnly = href.split("?")[0].split("#")[0] || "/";
        const memoryNavigate = (window as unknown as { __dailyfunNavigate?: (to: string) => void }).__dailyfunNavigate;
        if (memoryNavigate) memoryNavigate(pathOnly);
      } catch {
        // still nothing – wir haben zumindest den Default-Browser-Nav verhindert
      }
    };

    root.addEventListener("click", handleClick, true);
    return () => root.removeEventListener("click", handleClick, true);
  }, [shellRef]);
}
