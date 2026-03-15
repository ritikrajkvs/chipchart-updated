import { motion } from 'framer-motion';
import { Gauge, CheckCircle, BarChart3, ShoppingBag, Cpu, Layers, Zap, Shield } from 'lucide-react';

const features = [
  { icon: Cpu, title: 'Smart Matching', description: 'Optimal CPU-GPU pairing for your use case.' },
  { icon: CheckCircle, title: 'Compatibility Checks', description: 'Socket, RAM, PSU, and case verification.' },
  { icon: Gauge, title: 'Bottleneck Analysis', description: 'See how balanced your build is.' },
  { icon: BarChart3, title: 'FPS Benchmarks', description: 'Estimated FPS for popular games.' },
  { icon: ShoppingBag, title: 'Best Prices', description: 'Compare across Amazon, Flipkart & more.' },
  { icon: Layers, title: 'Alternatives', description: 'Alternative components for every part.' },
  { icon: Zap, title: 'Instant Results', description: 'Three optimized builds in seconds.' },
  { icon: Shield, title: 'Trusted Brands', description: 'Only quality-rated components.' },
];

export const FeaturesSection = () => {
  return (
    <section className="py-20 border-t border-border">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-3">Features</h2>
          <p className="text-muted-foreground">Everything you need to build or buy your perfect device</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="p-5 rounded-2xl border border-border bg-card hover:shadow-md transition-shadow"
            >
              <div className="mb-3 inline-flex p-2 rounded-xl bg-secondary">
                <feature.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-heading font-semibold mb-1">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
