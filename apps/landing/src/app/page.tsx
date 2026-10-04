import { Header } from "@/components/header";
import { Hero } from "@/components/hiro";
import { Features } from "@/components/features";
import { HowItWorks } from "@/components/how-it-works";
import { OnboardingVideo } from "@/components/onboarding";
import { Compare } from "@/components/compare";
import { InstallSection } from "@/components/install-section";
import { Cta } from "@/components/cta";
import { Footer } from "@/components/footer";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <OnboardingVideo />
        <Compare />
        <InstallSection />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
