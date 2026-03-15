import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Monitor, Laptop, ArrowRight } from 'lucide-react';

export const HeroSection = () => {
  return (
    <section className="pt-32 pb-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
            Smart recommendations in ₹ INR
          </div>

          <h1 className="font-heading text-4xl md:text-6xl font-extrabold tracking-tight mb-5 text-balance">
            Find your perfect
            <br />
            <span className="text-gradient">PC or Laptop</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-12">
            Answer a few questions and get personalized recommendations with
            compatibility checks, price comparisons, and buy links — all in ₹.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
            <Link to="/questionnaire?type=pc">
              <motion.div
                whileHover={{ y: -2 }}
                className="group p-6 rounded-2xl border border-border bg-card hover:border-accent/40 hover:shadow-lg transition-all cursor-pointer"
              >
                <Monitor className="h-8 w-8 mb-3 text-muted-foreground group-hover:text-accent transition-colors" />
                <h3 className="font-heading font-bold text-lg mb-1">Desktop PC</h3>
                <p className="text-sm text-muted-foreground mb-3">Build or buy a custom desktop</p>
                <span className="inline-flex items-center text-sm font-medium text-accent gap-1">
                  Get started <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </motion.div>
            </Link>
            <Link to="/questionnaire?type=laptop">
              <motion.div
                whileHover={{ y: -2 }}
                className="group p-6 rounded-2xl border border-border bg-card hover:border-accent/40 hover:shadow-lg transition-all cursor-pointer"
              >
                <Laptop className="h-8 w-8 mb-3 text-muted-foreground group-hover:text-accent transition-colors" />
                <h3 className="font-heading font-bold text-lg mb-1">Laptop</h3>
                <p className="text-sm text-muted-foreground mb-3">Find the best laptop for you</p>
                <span className="inline-flex items-center text-sm font-medium text-accent gap-1">
                  Get started <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </motion.div>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
