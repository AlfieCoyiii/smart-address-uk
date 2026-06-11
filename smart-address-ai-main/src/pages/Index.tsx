import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import AddressDemo from "@/components/AddressDemo";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 bg-gradient-hero pointer-events-none" aria-hidden />
      <div className="fixed inset-0 grid-pattern opacity-30 pointer-events-none" aria-hidden />

      <div className="relative z-[1]">
        <Navbar />
        <HeroSection />
        <AddressDemo />
        <Footer variant="home" />
      </div>
    </div>
  );
};

export default Index;
