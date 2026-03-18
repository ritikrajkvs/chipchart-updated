import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Monitor, Laptop, ArrowRight, Sparkles, ShieldCheck, Tag, Zap, Star } from 'lucide-react';

export const HeroSection = () => {
  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden pt-20 pb-16">
      {/* Background Decorations — works on both light and dark */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-accent/8 dark:bg-accent/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-violet-500/8 dark:bg-violet-500/10 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-accent/3 dark:bg-accent/5 blur-[150px]" />
      </div>

      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* LEFT — Hero Text */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Pill badge */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/8 dark:bg-accent/10 border border-accent/15 dark:border-accent/20 text-accent text-sm font-semibold mb-8 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI-powered smart recommendations in ₹ INR
            </motion.div>

            <h1 className="font-heading text-5xl md:text-6xl lg:text-[4.5rem] font-extrabold tracking-tight leading-[1.05] mb-6">
              Find your{' '}
              <br className="hidden sm:block" />
              perfect
              <br />
              <span className="text-gradient">PC or Laptop</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
              Answer a few questions and get personalized recommendations with
              compatibility checks, price comparisons, and buy links —{' '}
              <span className="text-foreground font-medium">all in ₹.</span>
            </p>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-5">
              {[
                { icon: <ShieldCheck className="h-4 w-4 text-accent" />, text: 'Compatibility guaranteed' },
                { icon: <Tag className="h-4 w-4 text-emerald-500" />, text: 'Best prices across stores' },
                { icon: <Zap className="h-4 w-4 text-amber-500" />, text: 'Results in seconds' },
              ].map((badge, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  {badge.icon} {badge.text}
                </div>
              ))}
            </div>
          </motion.div>

          {/* RIGHT — Selection Cards */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="flex flex-col gap-5"
          >
            {/* Desktop PC Card */}
            <Link to="/questionnaire?type=pc">
              <motion.div
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="group relative p-7 rounded-2xl border border-border bg-card hover:border-accent/40 shadow-sm hover:shadow-xl hover:shadow-accent/5 dark:hover:shadow-accent/10 transition-all cursor-pointer overflow-hidden"
              >
                {/* Glow on hover */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/5 dark:from-accent/10 to-violet-500/5 dark:to-violet-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent/8 dark:bg-accent/10 border border-accent/15 dark:border-accent/20 group-hover:bg-accent/12 dark:group-hover:bg-accent/15 transition-colors">
                      <Monitor className="h-7 w-7 text-accent" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-heading font-bold text-xl">Desktop PC</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/8 dark:bg-accent/10 text-accent border border-accent/15 dark:border-accent/20">
                          BUILD / BUY
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">Custom build or best pre-built picks</p>
                    </div>
                  </div>
                  <div className="ml-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 group-hover:bg-accent group-hover:border-accent transition-all duration-300 shadow-sm">
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>

                {/* Feature chips */}
                <div className="relative mt-5 flex flex-wrap gap-2">
                  {['Part-by-part build', 'Compatibility check', 'FPS estimates'].map((f) => (
                    <span key={f} className="text-[11px] text-muted-foreground bg-secondary/80 dark:bg-secondary/60 px-2.5 py-1 rounded-full border border-border">
                      {f}
                    </span>
                  ))}
                </div>
              </motion.div>
            </Link>

            {/* Laptop Card */}
            <Link to="/questionnaire?type=laptop">
              <motion.div
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="group relative p-7 rounded-2xl border border-border bg-card hover:border-violet-400/40 shadow-sm hover:shadow-xl hover:shadow-violet-500/5 dark:hover:shadow-violet-500/10 transition-all cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/5 dark:from-violet-500/10 to-fuchsia-500/5 dark:to-fuchsia-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-500/8 dark:bg-violet-500/10 border border-violet-500/15 dark:border-violet-500/20 group-hover:bg-violet-500/12 dark:group-hover:bg-violet-500/15 transition-colors">
                      <Laptop className="h-7 w-7 text-violet-500 dark:text-violet-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-heading font-bold text-xl">Laptop</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/8 dark:bg-violet-500/10 text-violet-500 dark:text-violet-400 border border-violet-500/15 dark:border-violet-500/20">
                          FIND BEST
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">Top picks matched to your needs</p>
                    </div>
                  </div>
                  <div className="ml-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 group-hover:bg-violet-500 group-hover:border-violet-500 transition-all duration-300 shadow-sm">
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>

                <div className="relative mt-5 flex flex-wrap gap-2">
                  {['Gaming laptops', 'Work & study', 'Price comparison'].map((f) => (
                    <span key={f} className="text-[11px] text-muted-foreground bg-secondary/80 dark:bg-secondary/60 px-2.5 py-1 rounded-full border border-border">
                      {f}
                    </span>
                  ))}
                </div>
              </motion.div>
            </Link>

            {/* Small info note */}
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <Star className="h-3 w-3 text-accent/50" />
              <p className="text-xs text-muted-foreground/70">Usually takes less than 2 minutes to complete</p>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};
