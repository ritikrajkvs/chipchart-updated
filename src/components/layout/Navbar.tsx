import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cpu, Menu, X, ShoppingCart, Monitor, Laptop } from 'lucide-react';
import { useState } from 'react';
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
    { href: '/questionnaire', label: 'Get Started' },
  ];

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
              ChipChart
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

          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" asChild onClick={() => handleDeviceNav('pc')}>
              <Link to="/questionnaire"><Monitor className="h-4 w-4" />PC Build</Link>
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" asChild onClick={() => handleDeviceNav('laptop')}>
              <Link to="/questionnaire"><Laptop className="h-4 w-4" />Laptop</Link>
            </Button>
            <div className="w-px h-4 bg-border" />
            <Button variant="ghost" size="icon" onClick={() => useBucketStore.getState().setIsOpen(true)} className="relative">
              <ShoppingCart className="h-5 w-5" />
              {useBucketStore((state) => state.items.length) > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />
              )}
            </Button>
            <Button variant="accent" size="sm" asChild>
              <Link to="/questionnaire">Find Your Build</Link>
            </Button>
          </div>

          <div className="md:hidden flex items-center gap-2">
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
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 gap-1.5" asChild onClick={() => handleDeviceNav('pc')}>
                <Link to="/questionnaire"><Monitor className="h-4 w-4" />PC Build</Link>
              </Button>
              <Button variant="outline" className="flex-1 gap-1.5" asChild onClick={() => handleDeviceNav('laptop')}>
                <Link to="/questionnaire"><Laptop className="h-4 w-4" />Laptop</Link>
              </Button>
            </div>
            <Button variant="accent" className="w-full mt-1" asChild>
              <Link to="/questionnaire" onClick={() => setIsOpen(false)}>
                Find Your Build
              </Link>
            </Button>
          </div>
        </motion.div>
      )}
    </motion.nav>
    </>
  );
};
