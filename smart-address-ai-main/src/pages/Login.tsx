import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import { SignIn } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const Login = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center px-4 pt-16 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm flex flex-col items-center"
        >
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <Logo />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
            <p className="mt-2 text-sm text-muted-foreground">Log in to your Smart Address UK account</p>
          </div>
          <SignIn
            routing="virtual"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/"
          />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/sign-up" className="text-primary hover:text-primary/80 font-medium">Sign up</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
