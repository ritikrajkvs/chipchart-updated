import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cpu, Menu, X, ShoppingCart, Monitor, Laptop, Sun, Moon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBucketStore } from '@/store/bucketStore';
import { BucketSheet } from './BucketSheet';
import { useQuestionnaireStore } from '@/store/questionnaireStore';

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { reset, setAnswer, setStep } = useQuestionnaireStore();

  const handleDeviceNav = (type: 'pc' | 'laptop') => {
    reset();
    setAnswer('deviceType', type);
    setStep(1);
    setIsOpen(false);
  };

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/results/laptops', label: 'My Laptops' },
    { href: '/results/pc', label: 'My PCs' },
  ];

  // Theme toggle logic
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial global theme
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    setIsDark(nextDark);
  };

  return (
    <>
      <BucketSheet />
      <motion.nav
        initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="p-1.5 rounded-lg bg-accent">
              <Cpu className="h-5 w-5 text-accent-foreground" />
            </div>
            <span className="font-heading text-lg font-bold">
              ChipChart AI
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  location.pathname === link.href
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground hover:text-accent transition-colors">
              {isDark ? <Sun className="h-[1.1rem] w-[1.1rem]" /> : <Moon className="h-[1.1rem] w-[1.1rem]" />}
            </Button>
            <div className="w-px h-5 bg-border/50" />
            <Button variant="ghost" size="icon" onClick={() => useBucketStore.getState().setIsOpen(true)} className="relative text-muted-foreground hover:text-accent transition-colors">
              <ShoppingCart className="h-[1.1rem] w-[1.1rem]" />
              {useBucketStore((state) => state.items.length) > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent animate-pulse" />
              )}
            </Button>
            <Button 
              className="relative overflow-hidden group bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 transition-all font-semibold"
              asChild
            >
              <Link to="/questionnaire">
                <span className="relative z-10 flex items-center gap-1.5 text-sm">
                  <Cpu className="h-4 w-4" /> Start Build
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/10 to-accent/0 group-hover:translate-x-full transition-transform duration-700 ease-in-out -translate-x-full" />
              </Link>
            </Button>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground hover:text-foreground">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => useBucketStore.getState().setIsOpen(true)} className="relative hover:bg-transparent">
              <ShoppingCart className="h-5 w-5" />
               {useBucketStore((state) => state.items.length) > 0 && (
                <span className="absolute top-1/4 right-1/4 h-2 w-2 rounded-full bg-accent" />
              )}
            </Button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-foreground"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="md:hidden border-t border-border bg-background"
        >
          <div className="container mx-auto px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "block py-2 px-3 rounded-lg text-sm transition-colors",
                  location.pathname === link.href
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary"
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex gap-2 pt-2 pb-1">
              <Link to="/questionnaire" onClick={() => { handleDeviceNav('pc'); setIsOpen(false); }} className="flex-1">
                <Button variant="outline" className="w-full gap-1.5 bg-accent/5 hover:bg-accent/10 border-accent/20 text-accent">
                  <Cpu className="h-4 w-4" /> Start Build
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </motion.nav>
    </>
  );
};
