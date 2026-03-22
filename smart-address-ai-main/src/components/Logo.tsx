import { Link } from "react-router-dom";

const Logo = ({ className = "" }: { className?: string }) => {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex items-center justify-center w-8 h-8">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
          {/* Grid/node icon */}
          <rect x="4" y="4" width="10" height="10" rx="2" className="fill-primary" opacity="0.9" />
          <rect x="18" y="4" width="10" height="10" rx="2" className="fill-primary" opacity="0.5" />
          <rect x="4" y="18" width="10" height="10" rx="2" className="fill-primary" opacity="0.5" />
          <rect x="18" y="18" width="10" height="10" rx="2" className="fill-accent" opacity="0.8" />
          {/* Connection lines */}
          <line x1="14" y1="9" x2="18" y2="9" className="stroke-primary" strokeWidth="1.5" opacity="0.4" />
          <line x1="9" y1="14" x2="9" y2="18" className="stroke-primary" strokeWidth="1.5" opacity="0.4" />
          <line x1="14" y1="23" x2="18" y2="23" className="stroke-accent" strokeWidth="1.5" opacity="0.6" />
          <line x1="23" y1="14" x2="23" y2="18" className="stroke-accent" strokeWidth="1.5" opacity="0.6" />
        </svg>
      </div>
      <span className="text-lg font-bold tracking-tight text-foreground">
        Smart<span className="text-gradient-primary">Address</span><span className="text-muted-foreground font-medium">UK</span>
      </span>
    </Link>
  );
};

export default Logo;
