import { motion } from 'framer-motion';
import { MessageSquare, Settings, Sparkles, ShoppingCart } from 'lucide-react';

const steps = [
  { icon: MessageSquare, title: 'Answer Questions', description: 'Tell us about your needs, budget, and preferences.' },
  { icon: Settings, title: 'We Analyze', description: 'Our engine matches your requirements with optimal hardware.' },
  { icon: Sparkles, title: 'Get Recommendations', description: 'Receive personalized builds with compatibility checks.' },
  { icon: ShoppingCart, title: 'Buy at Best Price', description: 'Compare prices across Amazon, Flipkart, and more.' },
];

export const HowItWorks = () => {
  return (
    <section className="py-20 border-t border-border">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-3">How it works</h2>
          <p className="text-muted-foreground">From questions to your perfect build in minutes</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative p-6 rounded-2xl border border-border bg-card"
            >
              <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>
              <div className="inline-flex p-2.5 rounded-xl bg-secondary mb-4">
                <step.icon className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-heading font-semibold mb-1.5">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
