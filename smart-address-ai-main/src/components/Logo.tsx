import { Link } from "react-router-dom";

const Logo = ({ className = "" }: { className?: string }) => {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <img src="/logo-mark.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
      <span className="text-lg font-bold tracking-tight text-foreground">
        Smart<span className="text-gradient-primary">Address</span><span className="text-muted-foreground font-medium">UK</span>
      </span>
    </Link>
  );
};

export default Logo;
