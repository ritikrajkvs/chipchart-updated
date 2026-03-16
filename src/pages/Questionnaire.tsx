import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gamepad2, Film, Briefcase, Brain, Radio, Laptop, Monitor,
  IndianRupee, MonitorSmartphone, CircleDot, Code, GraduationCap,
  Zap, ArrowUpCircle, Cpu, MemoryStick, LayoutGrid
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { QuestionCard, OptionCard } from '@/components/questionnaire/QuestionCard';
import { useQuestionnaireStore, DeviceType } from '@/store/questionnaireStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const pcQuestions = [
  { key: 'deviceType', question: 'What type of device are you looking for?', description: 'Choose your preferred form factor' },
  { key: 'purpose', question: 'What will you primarily use this PC for?', description: 'Select your main use case' },
  { key: 'budget', question: "What's your budget?", description: 'Enter your maximum budget in ₹ (Indian Rupees)' },
  { key: 'targetResolution', question: 'What resolution will you be gaming / working at?', description: 'This determines how powerful your GPU needs to be' },
  { key: 'cpuBrandPreference', question: 'Do you have a CPU brand preference?', description: 'Intel and AMD both offer great options — choose what you prefer' },
  { key: 'upgradabilityPriority', question: 'How future-proof should this build be?', description: 'Higher upgradability means a better platform with room to grow' },
  { key: 'ramRequirement', question: 'How much RAM do you need?', description: 'More RAM helps with multitasking, creative work, and gaming' },
  { key: 'pcFormFactor', question: 'What size case suits your space?', description: 'This affects how many components you can add later' },
  { key: 'pcVisualStyle', question: "What's the 'vibe' of your dream setup?", description: 'Select your preferred aesthetic' },
];

const laptopQuestions = [
  { key: 'deviceType', question: 'What type of device are you looking for?', description: 'Choose your preferred form factor' },
  { key: 'purpose', question: 'What will you primarily use this laptop for?', description: 'Select your main use case' },
  { key: 'budget', question: "What's your budget?", description: 'Enter your maximum budget in ₹ (Indian Rupees)' },
  { key: 'displayType', question: 'What kind of display experience do you need?', description: 'Choose based on your primary usage' },
  { key: 'screenSize', question: 'What screen size do you prefer?', description: 'Balancing workspace and physical footprint' },
  { key: 'mobility', question: 'How important is portability and battery life?', description: 'Combine your travel and power needs' },
  { key: 'buildMaterial', question: 'Do you prefer a plastic or metal laptop?', description: 'Metal feels premium, plastic is generally more affordable' },
  { key: 'storageSize', question: 'How much storage space do you need?', description: 'Pick based on how many files and heavy apps you plan to save' },
  { key: 'laptopBrandPreference', question: 'Do you have a brand preference?', description: 'Pick your preferred brand or let us recommend the best option' },
];

const Questionnaire = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentStep, answers, setStep, nextStep, prevStep, setAnswer, complete, reset } = useQuestionnaireStore();

  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const type = searchParams.get('type') as DeviceType | null;
    if (type === 'laptop' || type === 'pc') {
      reset();
      setAnswer('deviceType', type);
      setStep(1);
      navigate('/questionnaire', { replace: true });
    } else if (answers.deviceType && currentStep === 0) {
      setStep(1);
    }
  }, [searchParams, navigate, reset, setAnswer, setStep, answers.deviceType, currentStep]);

  const questions = answers.deviceType === 'laptop' ? laptopQuestions : pcQuestions;

  const handleNext = () => {
    if (currentStep === questions.length - 1) {
      complete();
      navigate(answers.deviceType === 'laptop' ? '/results/laptops' : '/results/pc');
    } else {
      nextStep();
    }
  };

  const handlePrev = () => {
    if (currentStep === 0) {
      reset();
      navigate('/');
    } else {
      prevStep();
    }
  };

  const canProgress = () => {
    const q = questions[currentStep];
    switch (q.key) {
      case 'deviceType': return answers.deviceType !== null;
      case 'purpose': return answers.purpose !== null;
      case 'budget': return answers.budget !== null && answers.budget > 0;
      // PC steps
      case 'targetResolution': return !!answers.targetResolution;
      case 'cpuBrandPreference': return !!answers.cpuBrandPreference;
      case 'upgradabilityPriority': return !!answers.upgradabilityPriority;
      case 'ramRequirement': return !!answers.ramRequirement;
      case 'pcFormFactor': return !!answers.pcFormFactor;
      case 'pcVisualStyle': return !!answers.pcVisualStyle;
      // Laptop steps
      case 'displayType': return !!answers.displayType;
      case 'screenSize': return !!answers.screenSize;
      case 'mobility': return !!answers.mobility;
      case 'buildMaterial': return !!answers.buildMaterial;
      case 'storageSize': return !!answers.storageSize;
      case 'laptopBrandPreference': return true; // any selection (or none) is valid
      default: return true;
    }
  };

  const renderQuestion = () => {
    const q = questions[currentStep];

    switch (q.key) {
      case 'deviceType':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setAnswer('deviceType', 'pc')}
              className={`p-6 rounded-2xl border text-center transition-all ${
                answers.deviceType === 'pc'
                  ? 'border-accent bg-accent/5 shadow-sm'
                  : 'border-border bg-card hover:border-accent/30'
              }`}
            >
              <Monitor className={`h-10 w-10 mx-auto mb-3 ${answers.deviceType === 'pc' ? 'text-accent' : 'text-muted-foreground'}`} />
              <h3 className="font-heading text-xl font-bold mb-1">Desktop PC</h3>
              <p className="text-sm text-muted-foreground">Maximum performance & upgradeability</p>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setAnswer('deviceType', 'laptop')}
              className={`p-6 rounded-2xl border text-center transition-all ${
                answers.deviceType === 'laptop'
                  ? 'border-accent bg-accent/5 shadow-sm'
                  : 'border-border bg-card hover:border-accent/30'
              }`}
            >
              <Laptop className={`h-10 w-10 mx-auto mb-3 ${answers.deviceType === 'laptop' ? 'text-accent' : 'text-muted-foreground'}`} />
              <h3 className="font-heading text-xl font-bold mb-1">Laptop</h3>
              <p className="text-sm text-muted-foreground">Portability and convenience</p>
            </motion.button>
          </div>
        );

      case 'purpose':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { value: 'gaming', icon: <Gamepad2 className="h-5 w-5" />, title: 'Gaming', desc: 'High FPS, smooth gameplay' },
              { value: 'content-creation', icon: <Film className="h-5 w-5" />, title: 'Content Creation', desc: 'Video editing, 3D rendering' },
              { value: 'office', icon: <Briefcase className="h-5 w-5" />, title: 'Office & Productivity', desc: 'Documents, browsing' },
              { value: 'ml-ai', icon: <Brain className="h-5 w-5" />, title: 'Machine Learning / AI', desc: 'Training models, CUDA' },
              { value: 'streaming', icon: <Radio className="h-5 w-5" />, title: 'Streaming', desc: 'Live streaming + gaming' },
              { value: 'coding', icon: <Code className="h-5 w-5" />, title: 'Development', desc: 'Programming, IDEs' },
              { value: 'student', icon: <GraduationCap className="h-5 w-5" />, title: 'Student', desc: 'Study, research' },
              { value: 'general', icon: <CircleDot className="h-5 w-5" />, title: 'General Use', desc: 'Balanced for everything' },
            ].map((option) => (
              <OptionCard
                key={option.value}
                icon={option.icon}
                title={option.title}
                description={option.desc}
                selected={answers.purpose === option.value}
                onClick={() => setAnswer('purpose', option.value as any)}
              />
            ))}
          </div>
        );

      case 'budget':
        return (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="budget">Budget (₹ INR)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="budget"
                  type="number"
                  placeholder="e.g., 100000"
                  value={answers.budget || ''}
                  onChange={(e) => setAnswer('budget', parseInt(e.target.value) || null)}
                  className="pl-10 h-12 text-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[50000, 75000, 100000, 150000, 200000, 300000].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setAnswer('budget', amount)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${
                    answers.budget === amount
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border'
                  }`}
                >
                  ₹{(amount / 1000).toFixed(0)}K
                </button>
              ))}
            </div>
            {answers.budget && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-accent/5 border border-accent/20"
              >
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-accent">Estimated Tier:</span>{' '}
                  {answers.budget < 60000 ? 'Entry-Level (Ryzen 5 / i5 + GTX 1650)' :
                   answers.budget < 100000 ? 'Mid-Range (Ryzen 5 / i5 + RTX 4060)' :
                   answers.budget < 150000 ? 'High-End (Ryzen 7 / i7 + RTX 4070)' :
                   'Enthusiast (Ryzen 9 / i9 + RTX 4080/4090)'}
                </p>
              </motion.div>
            )}
          </div>
        );

      case 'targetResolution':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { value: '1080p', title: '1080p (Full HD)', desc: 'Best value — most games 100+ FPS', badge: 'Most Popular' },
              { value: '1440p', title: '1440p (2K)', desc: 'Sweet spot — sharpness + performance', badge: 'Recommended' },
              { value: '4k', title: '4K (Ultra HD)', desc: 'Cinematic detail — needs a powerful GPU', badge: 'Enthusiast' },
            ].map((option) => (
              <OptionCard
                key={option.value}
                icon={<MonitorSmartphone className="h-5 w-5" />}
                title={option.title}
                description={option.desc}
                selected={answers.targetResolution === option.value}
                onClick={() => setAnswer('targetResolution', option.value as any)}
              />
            ))}
          </div>
        );

      case 'cpuBrandPreference':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <OptionCard
              icon={<Cpu className="h-5 w-5" />}
              title="Intel"
              description="Strong single-core, great for gaming. Core i5 / i7 / i9 lineup."
              selected={answers.cpuBrandPreference === 'intel'}
              onClick={() => setAnswer('cpuBrandPreference', 'intel')}
            />
            <OptionCard
              icon={<Cpu className="h-5 w-5" />}
              title="AMD"
              description="Excellent multi-core, better value. Ryzen 5 / 7 / 9 lineup."
              selected={answers.cpuBrandPreference === 'amd'}
              onClick={() => setAnswer('cpuBrandPreference', 'amd')}
            />
            <OptionCard
              icon={<CircleDot className="h-5 w-5" />}
              title="No Preference"
              description="Let us pick the best CPU for your needs and budget."
              selected={answers.cpuBrandPreference === 'no-preference'}
              onClick={() => setAnswer('cpuBrandPreference', 'no-preference')}
            />
          </div>
        );

      case 'upgradabilityPriority':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <OptionCard
              icon={<ArrowUpCircle className="h-5 w-5" />}
              title="Future-Proof"
              description="Invest in a platform that supports future CPU/GPU upgrades. Best long-term value."
              selected={answers.upgradabilityPriority === 'future-proof'}
              onClick={() => setAnswer('upgradabilityPriority', 'future-proof')}
            />
            <OptionCard
              icon={<Zap className="h-5 w-5" />}
              title="Balanced"
              description="Good upgrade headroom without overspending on the platform."
              selected={answers.upgradabilityPriority === 'balanced'}
              onClick={() => setAnswer('upgradabilityPriority', 'balanced')}
            />
            <OptionCard
              icon={<Code className="h-5 w-5" />}
              title="Performance Now"
              description="Spend it all on raw power today — upgrade the whole PC later."
              selected={answers.upgradabilityPriority === 'budget-tight'}
              onClick={() => setAnswer('upgradabilityPriority', 'budget-tight')}
            />
          </div>
        );

      case 'ramRequirement':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <OptionCard
              icon={<MemoryStick className="h-5 w-5" />}
              title="8 GB"
              description="Enough for basic gaming and office tasks."
              selected={answers.ramRequirement === '8gb'}
              onClick={() => setAnswer('ramRequirement', '8gb')}
            />
            <OptionCard
              icon={<MemoryStick className="h-5 w-5" />}
              title="16 GB"
              description="Sweet spot for gaming, streaming, and multitasking."
              selected={answers.ramRequirement === '16gb'}
              onClick={() => setAnswer('ramRequirement', '16gb')}
            />
            <OptionCard
              icon={<MemoryStick className="h-5 w-5" />}
              title="32 GB+"
              description="Needed for video editing, 3D rendering, ML/AI workloads."
              selected={answers.ramRequirement === '32gb-plus'}
              onClick={() => setAnswer('ramRequirement', '32gb-plus')}
            />
          </div>
        );

      case 'pcFormFactor':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <OptionCard
              icon={<LayoutGrid className="h-5 w-5" />}
              title="Compact (Mini-ITX)"
              description="Small footprint. Great for tight desks — limited expansion slots."
              selected={answers.pcFormFactor === 'compact'}
              onClick={() => setAnswer('pcFormFactor', 'compact')}
            />
            <OptionCard
              icon={<Monitor className="h-5 w-5" />}
              title="Mid-Tower (ATX)"
              description="Standard size. Easy to build, great airflow, room for GPU + extra drives."
              selected={answers.pcFormFactor === 'mid-tower'}
              onClick={() => setAnswer('pcFormFactor', 'mid-tower')}
            />
            <OptionCard
              icon={<Monitor className="h-5 w-5" />}
              title="Full-Tower (E-ATX)"
              description="Maximum space for workstation-class builds, custom water cooling, and expansion."
              selected={answers.pcFormFactor === 'full-tower'}
              onClick={() => setAnswer('pcFormFactor', 'full-tower')}
            />
          </div>
        );

      case 'pcVisualStyle':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { value: 'stealth', title: 'Stealth Black', desc: 'Dark & Minimal — no distractions' },
              { value: 'white', title: 'Clean White', desc: 'Modern & Bright aesthetic' },
              { value: 'rgb', title: 'RGB Powerhouse', desc: 'Vibrant, customizable lighting' },
            ].map((option) => (
              <OptionCard
                key={option.value}
                icon={<CircleDot className="h-5 w-5" />}
                title={option.title}
                description={option.desc}
                selected={answers.pcVisualStyle === option.value}
                onClick={() => setAnswer('pcVisualStyle', option.value as any)}
              />
            ))}
          </div>
        );

      case 'displayType': {
        const isIntensive = answers.purpose === 'gaming' || answers.purpose === 'ml-ai';
        const options = isIntensive ? [
          { value: 'high-hertz', title: 'High Refresh Rate', desc: '144Hz+ for competitive gaming / smooth UI' },
          { value: 'vibrant-oled', title: 'Color Accurate (OLED)', desc: 'Best for visual fidelity & deep blacks' },
          { value: 'standard-ips', title: 'Standard (IPS)', desc: 'Basic 60Hz display to save budget' },
        ] : [
          { value: 'standard-ips', title: 'Standard Anti-Glare', desc: 'Great for reading & office work' },
          { value: 'vibrant-oled', title: 'Vibrant Display (OLED)', desc: 'Best for movies & multimedia' },
          { value: 'touchscreen', title: 'Touchscreen / 2-in-1', desc: 'Best for drawing & note-taking' },
        ];
        
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {options.map((option) => (
              <OptionCard
                key={option.value}
                icon={<MonitorSmartphone className="h-5 w-5" />}
                title={option.title}
                description={option.desc}
                selected={answers.displayType === option.value}
                onClick={() => setAnswer('displayType', option.value as any)}
              />
            ))}
          </div>
        );
      }

      case 'screenSize':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { value: 'compact', title: 'Compact (13" - 14")', desc: 'Easy to carry, fits anywhere' },
              { value: 'standard', title: 'Standard (15" - 16")', desc: 'Sweet spot for work & play' },
              { value: 'large', title: 'Large (17"+)', desc: 'Max screen real estate, desktop replacement' },
            ].map((option) => (
              <OptionCard
                key={option.value}
                icon={<LayoutGrid className="h-5 w-5" />}
                title={option.title}
                description={option.desc}
                selected={answers.screenSize === option.value}
                onClick={() => setAnswer('screenSize', option.value as any)}
              />
            ))}
          </div>
        );

      case 'mobility': {
        const isIntensive = answers.purpose === 'gaming' || answers.purpose === 'ml-ai';
        const options = isIntensive ? [
          { value: 'stationary', title: 'Desktop Replacement', desc: 'Thick & cool, maximum performance (Always Plugged)' },
          { value: 'balanced', title: 'Balanced Gaming', desc: 'Standard weight, 3-5 hours on battery' },
          { value: 'on-the-go', title: 'Thin & Light Gaming', desc: 'Highly portable, but runs hotter' },
          { value: 'no-preference', title: 'No Preference', desc: 'Just find me the best gaming deal' },
        ] : [
          { value: 'stationary', title: 'Stationary', desc: 'Plugged in often' },
          { value: 'balanced', title: 'Balanced Commute', desc: 'Standard weight/power' },
          { value: 'on-the-go', title: 'Always On-the-Go', desc: 'Ultra-light, 8+ hrs battery' },
          { value: 'no-preference', title: 'No Preference', desc: 'Find the best overall deal' },
        ];
        
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {options.map((option) => (
              <OptionCard
                key={option.value}
                icon={<Zap className="h-5 w-5" />}
                title={option.title}
                description={option.desc}
                selected={answers.mobility === option.value}
                onClick={() => setAnswer('mobility', option.value as any)}
              />
            ))}
          </div>
        );
      }

      case 'buildMaterial':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-3">
            <OptionCard
              icon={<Briefcase className="h-5 w-5" />}
              title="Standard Plastic"
              description="More affordable and lightweight"
              selected={answers.buildMaterial === 'budget-plastic'}
              onClick={() => setAnswer('buildMaterial', 'budget-plastic')}
            />
            <OptionCard
              icon={<Briefcase className="h-5 w-5" />}
              title="Premium Metal"
              description="Sleek, sturdy, and premium feel"
              selected={answers.buildMaterial === 'premium-metal'}
              onClick={() => setAnswer('buildMaterial', 'premium-metal')}
            />
            <OptionCard
              icon={<CircleDot className="h-5 w-5" />}
              title="No Preference"
              description="Whatever gives the best value"
              selected={answers.buildMaterial === 'no-preference'}
              onClick={() => setAnswer('buildMaterial', 'no-preference')}
            />
          </div>
        );

      case 'storageSize':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { value: 'basic', title: 'Basic (256-512GB)', desc: 'Standard usage' },
              { value: 'ample', title: 'Ample (1TB)', desc: 'Games and Media' },
              { value: 'massive', title: 'Massive (2TB+)', desc: 'Heavy archiving' },
            ].map((option) => (
              <OptionCard
                key={option.value}
                icon={<Code className="h-5 w-5" />}
                title={option.title}
                description={option.desc}
                selected={answers.storageSize === option.value}
                onClick={() => setAnswer('storageSize', option.value as any)}
              />
            ))}
          </div>
        );

      case 'laptopBrandPreference': {
        const selected = answers.laptopBrandPreference ?? [];
        const toggleBrand = (value: string) => {
          if (value === 'no-preference') {
            // If "No Preference" clicked, clear everything and set only no-preference
            const next = selected.includes('no-preference') ? [] : ['no-preference'];
            setAnswer('laptopBrandPreference', next);
          } else {
            // Remove no-preference when a specific brand is picked
            let next = selected.filter((b) => b !== 'no-preference');
            if (next.includes(value)) {
              next = next.filter((b) => b !== value);
            } else {
              next = [...next, value];
            }
            setAnswer('laptopBrandPreference', next);
          }
        };
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select one or more brands (or leave blank for best pick)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { value: 'no-preference', title: 'Best Available', desc: 'Pick the top-rated option for me' },
                { value: 'apple', title: 'Apple', desc: 'MacBook Air / Pro' },
                { value: 'asus', title: 'ASUS', desc: 'ROG / Vivobook / Zenbook' },
                { value: 'lenovo', title: 'Lenovo', desc: 'ThinkPad / IdeaPad / Legion' },
                { value: 'dell', title: 'Dell', desc: 'XPS / Inspiron / Alienware' },
                { value: 'hp', title: 'HP', desc: 'Pavilion / Envy / Omen' },
                { value: 'acer', title: 'Acer', desc: 'Swift / Nitro / Predator' },
                { value: 'msi', title: 'MSI', desc: 'Titan / Stealth / Raider' },
                { value: 'samsung', title: 'Samsung', desc: 'Galaxy Book Series' },
              ].map((option) => (
                <OptionCard
                  key={option.value}
                  icon={<Laptop className="h-5 w-5" />}
                  title={option.title}
                  description={option.desc}
                  selected={selected.includes(option.value)}
                  onClick={() => toggleBrand(option.value)}
                />
              ))}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-16 min-h-screen">
        {answers.deviceType && currentStep > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto mb-6"
          >
            <div className="px-4 py-2.5 rounded-xl bg-secondary border border-border flex items-center gap-3">
              {answers.deviceType === 'pc' ? (
                <Monitor className="h-4 w-4 text-accent" />
              ) : (
                <Laptop className="h-4 w-4 text-accent" />
              )}
              <span className="text-sm">
                <span className="font-medium">{answers.deviceType === 'pc' ? 'Desktop PC' : 'Laptop'}</span>
                {answers.purpose && <> · <span className="capitalize">{answers.purpose.replace('-', ' ')}</span></>}
                {answers.budget && <> · <span className="text-accent font-medium">₹{answers.budget.toLocaleString()}</span></>}
              </span>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <QuestionCard
            key={`${answers.deviceType}-${currentStep}`}
            step={currentStep}
            totalSteps={questions.length}
            question={questions[currentStep].question}
            description={questions[currentStep].description}
            onNext={handleNext}
            onPrev={handlePrev}
            canProgress={canProgress()}
            isFirst={currentStep === 0}
            isLast={currentStep === questions.length - 1}
          >
            {renderQuestion()}
          </QuestionCard>
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  );
};

export default Questionnaire;
