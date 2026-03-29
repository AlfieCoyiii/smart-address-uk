import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthenticateWithRedirectCallback } from "@clerk/react";
import { Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Pricing from "./pages/Pricing";
import Contact from "./pages/Contact";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import HowItWorks from "./pages/HowItWorks";
import About from "./pages/About";
import DataSources from "./pages/DataSources";
import Team from "./pages/Team";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Routes>
        {/* Host misconfig: some setups Redirect (not Rewrite) to /index.html — fix URL for the router */}
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="/" element={<Index />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/sign-in/sso-callback" element={<AuthenticateWithRedirectCallback />} />
        <Route path="/sign-up/sso-callback" element={<AuthenticateWithRedirectCallback />} />
        <Route path="/sign-in" element={<Login />} />
        <Route path="/sign-in/*" element={<Login />} />
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/sign-up/*" element={<SignUp />} />
        <Route path="/login" element={<Navigate to="/sign-in" replace />} />
        <Route path="/signup" element={<Navigate to="/sign-up" replace />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/data-sources" element={<DataSources />} />
        <Route path="/team" element={<Team />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
