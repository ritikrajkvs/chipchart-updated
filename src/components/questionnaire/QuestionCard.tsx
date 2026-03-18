import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
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
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="max-w-2xl mx-auto"
    >
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Step {step + 1} of {totalSteps}</span>
          <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="mb-8">
        <h2 className="font-heading text-2xl md:text-3xl font-bold mb-2">{question}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      {/* Content */}
      <div className="mb-8">{children}</div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onPrev} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {isFirst ? 'Home' : 'Back'}
        </Button>
        <Button
          variant="accent"
          onClick={onNext}
          disabled={!canProgress}
          className="gap-2"
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

import { AlertTriangle } from 'lucide-react';

interface OptionCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  budgetWarning?: boolean;
}

export const OptionCard = ({ icon, title, description, selected, onClick, budgetWarning }: OptionCardProps) => {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "p-4 rounded-xl border text-left transition-all w-full relative",
        selected && budgetWarning
          ? "border-amber-400 bg-amber-500/5 shadow-sm"
          : selected
          ? "border-accent bg-accent/5 shadow-sm"
          : budgetWarning
          ? "border-amber-300/50 bg-amber-500/[0.02] hover:border-amber-400/60"
          : "border-border bg-card hover:border-accent/30"
      )}
    >
      {budgetWarning && (
        <div className="absolute -top-2.5 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-600">
          <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">May increase budget</span>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className={cn(
          "p-2 rounded-lg shrink-0 transition-colors",
          selected && budgetWarning ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : selected ? "bg-accent/10 text-accent"
          : budgetWarning ? "bg-amber-500/5 text-amber-500"
          : "bg-secondary text-muted-foreground"
        )}>
          {icon}
        </div>
        <div>
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </motion.button>
  );
};
