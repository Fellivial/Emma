import Hero from "@/components/landing/Hero";
import Problem from "@/components/landing/Problem";
import Introducing from "@/components/landing/Introducing";
import Approach from "@/components/landing/Approach";
import Capabilities from "@/components/landing/Capabilities";
import StatsStrip from "@/components/landing/StatsStrip";
import TerminalShowcase from "@/components/landing/TerminalShowcase";
import Pricing from "@/components/landing/Pricing";
import Waitlist from "@/components/landing/Waitlist";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <Problem />
      <Introducing />
      <Approach />
      <StatsStrip />
      <Capabilities />
      <TerminalShowcase />
      <Pricing />
      <Waitlist />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
