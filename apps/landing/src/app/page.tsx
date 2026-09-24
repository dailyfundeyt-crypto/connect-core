import { Header } from "@/components/header";
import { Hero } from "@/components/hiro";
import { Cta } from "@/components/cta";
import { Footer } from "@/components/footer";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
