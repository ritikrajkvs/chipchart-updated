import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const CTASection = () => {
  return (
    <section className="py-20 border-t border-border">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="font-heading text-3xl md:text-5xl font-bold mb-4">
            Ready to find your
            <span className="block text-gradient">perfect build?</span>
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Stop guessing. Get a recommendation tailored to your needs and budget in just a few minutes.
          </p>
          <Button variant="accent" size="xl" asChild>
            <Link to="/questionnaire" className="group">
              Start Building
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};
