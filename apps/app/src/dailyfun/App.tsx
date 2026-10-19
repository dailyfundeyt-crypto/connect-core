import { Toaster } from "@dailyfun/components/ui/toaster";
import { Toaster as Sonner } from "@dailyfun/components/ui/sonner";
import { TooltipProvider } from "@dailyfun/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation, useNavigationType, useNavigate as useRouterNavigate } from "react-router-dom";
import { useEffect } from "react";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { GradientProvider } from "./contexts/GradientContext";
import { SidebarProvider } from "@dailyfun/components/ui/sidebar";
import { AppSidebar } from "./components/AppSidebar";
import { AnimatedBackground } from "./components/AnimatedBackground";
import Header from "./components/Header";
import MobileBottomNav from "./components/MobileBottomNav";
import Search from "./pages/Search";
import Article from "./pages/Article";
import AboutUs from "./pages/AboutUs";
import Products from "./pages/Products";
import CategoryPage from "./pages/CategoryPage";
import ProfileManagement from "./pages/ProfileManagement";
import Profile from "./pages/Profile";
import Contact from "./pages/Contact";
import SocialMedia from "./pages/SocialMedia";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import AI from "./pages/AI";
import Auth from "./pages/Auth";
import CreateArticle from "./pages/CreateArticle";
import Messages from "./pages/Messages";
import Analytics from "./pages/Analytics";
import Community from "./pages/Community";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Component to handle scroll restoration
const ScrollToTop = () => {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    const shouldRestore = (location.state as any)?.restoreScroll;
    if (navigationType === 'PUSH' && !shouldRestore) {
      window.scrollTo(0, 0);
    }
  }, [location, navigationType]);

  return null;
};

// Stellt dailyfuns `useNavigate` an einem window-Property bereit, damit der
// Connect-Wrapper (ConnectApp.tsx) eingehende `<a>`-Klicks an den
// MemoryRouter weiterleiten kann, ohne dass die Browser-URL angefasst wird.
// So kollidiert täglich-Routing nie mit dem äußeren TanStack-Router.
const ExposeNavigate = () => {
  const navigate = useRouterNavigate();
  useEffect(() => {
    (window as unknown as { __dailyfunNavigate?: (to: string) => void }).__dailyfunNavigate = (to) => navigate(to);
    return () => {
      delete (window as unknown as { __dailyfunNavigate?: (to: string) => void }).__dailyfunNavigate;
    };
  }, [navigate]);
  return null;
};

const App = () => (
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
                <SidebarProvider>
                  <div className="min-h-screen flex w-full bg-background relative">
                    {/* Animated Background Component */}
                    <AnimatedBackground />

                    <AppSidebar />
                    <div className="flex flex-col flex-1 w-full relative z-10">
                      <Header />
                      <main className="flex-1 pb-16 md:pb-0">
                        <Routes>
                          <Route path="/" element={<Search />} />
                          <Route path="/search" element={<Search />} />
                          <Route path="/about" element={<AboutUs />} />
                          <Route path="/products" element={<Products />} />
                          <Route path="/contact" element={<Contact />} />
                          <Route path="/social-media" element={<SocialMedia />} />
                          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                          <Route path="/terms-of-service" element={<TermsOfService />} />
                          <Route path="/ai" element={<AI />} />
                          <Route path="/auth" element={<Auth />} />
                          <Route path="/article/:id" element={<Article />} />
                          <Route path="/weird" element={<ProfileManagement />} />
                          <Route path="/profile/:userId" element={<Profile />} />
                          <Route path="/create-article" element={<CreateArticle />} />
                          <Route path="/messages" element={<Messages />} />
                          <Route path="/analytics" element={<Analytics />} />
                          <Route path="/community" element={<Community />} />
                          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </main>
                      <MobileBottomNav />
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

export default App;
