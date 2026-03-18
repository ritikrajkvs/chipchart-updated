import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface QuestionCardProps {
  step: number;
  totalSteps: number;
  question: string;
  description: string;
  onNext: () => void;
  onPrev: () => void;
  canProgress: boolean;
  isFirst: boolean;
  isLast: boolean;
  children: ReactNode;
}

export const QuestionCard = ({
  step, totalSteps, question, description,
  onNext, onPrev, canProgress, isFirst, isLast, children,
}: QuestionCardProps) => {
  const progress = ((step + 1) / totalSteps) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="max-w-2xl mx-auto"
    >
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm mb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="font-semibold text-foreground">Step {step + 1}</span>
            <span className="text-muted-foreground">of {totalSteps}</span>
          </div>
          <span className="text-xs font-bold text-accent bg-accent/8 dark:bg-accent/10 px-2 py-0.5 rounded-full">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden shadow-inner">
          <motion.div
            className="h-full bg-gradient-to-r from-accent to-violet-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="mb-8">
        <h2 className="font-heading text-2xl md:text-3xl font-extrabold mb-2 tracking-tight">{question}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      {/* Content */}
      <div className="mb-8">{children}</div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          onClick={onPrev}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {isFirst ? 'Home' : 'Back'}
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProgress}
          className={cn(
            "gap-2 font-semibold shadow-lg transition-all",
            isLast
              ? "bg-gradient-to-r from-accent to-violet-500 hover:from-accent/90 hover:to-violet-500/90 text-white shadow-accent/20 border-0"
              : "bg-accent hover:bg-accent/90 text-accent-foreground shadow-accent/10"
          )}
        >
          {isLast ? (
            <>Generate Results <Check className="h-4 w-4" /></>
          ) : (
            <>Next <ArrowRight className="h-4 w-4" /></>
          )}
        </Button>
      </div>
    </motion.div>
  );
};

// ─── OptionCard ────────────────────────────────────────────

interface OptionCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  budgetWarning?: boolean;
}

export const OptionCard = ({ icon, title, description, selected, onClick, budgetWarning }: OptionCardProps) => {
  const showWarning = selected && budgetWarning;

  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "p-4 rounded-xl border text-left transition-all w-full relative group",
        showWarning
          ? "border-amber-400/60 dark:border-amber-400 bg-amber-50 dark:bg-amber-500/5 shadow-sm shadow-amber-500/5"
          : selected
          ? "border-accent/60 dark:border-accent bg-accent/5 shadow-md shadow-accent/5"
          : "border-border bg-card hover:border-accent/30 hover:shadow-sm"
      )}
    >
      {showWarning && (
        <div className="absolute -top-2.5 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-600 shadow-sm">
          <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">May increase budget</span>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className={cn(
          "p-2 rounded-xl shrink-0 transition-all",
          showWarning ? "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : selected ? "bg-accent/10 text-accent shadow-sm"
          : "bg-secondary text-muted-foreground group-hover:bg-accent/5 group-hover:text-accent/70"
        )}>
          {icon}
        </div>
        <div>
          <h4 className={cn(
            "font-semibold text-sm transition-colors",
            selected ? "text-foreground" : "text-foreground/80"
          )}>{title}</h4>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      {/* Selected indicator */}
      {selected && !showWarning && (
        <div className="absolute top-3 right-3">
          <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center shadow-sm">
            <Check className="h-3 w-3 text-white" />
          </div>
        </div>
      )}
    </motion.button>
  );
};
