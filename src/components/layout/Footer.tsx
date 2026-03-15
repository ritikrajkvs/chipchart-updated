import { Link } from 'react-router-dom';
import { Cpu } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="border-t border-border">
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent">
              <Cpu className="h-4 w-4 text-accent-foreground" />
            </div>
            <span className="font-heading text-base font-bold">ChipChart</span>
          </Link>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} ChipChart. Find your perfect build.
          </p>
        </div>
      </div>
    </footer>
  );
};
