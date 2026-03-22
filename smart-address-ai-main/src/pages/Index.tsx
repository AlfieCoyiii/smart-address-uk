import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import AddressDemo from "@/components/AddressDemo";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <AddressDemo />
      <Footer />
    </div>
  );
};

export default Index;
