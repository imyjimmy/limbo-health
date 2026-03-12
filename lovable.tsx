import { motion } from "framer-motion";
import { GitBranch, Shield, Smartphone, ArrowRight } from "lucide-react";
import appIcon from "@/assets/icon.png";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: "easeOut" as const },
  }),
};

const features = [
  {
    icon: GitBranch,
    title: "Your Medical History as a Git Repo",
    description:
      "Every diagnosis, prescription, and lab result versioned and tracked. Branch, diff, and never lose a record again.",
    terminal: "git log --oneline medical-history",
  },
  {
    icon: Smartphone,
    title: "A Medical Advocate at the Palm of Your Hands",
    description:
      "Carry your complete medical record everywhere. Instant access during emergencies, travel, or new doctor visits.",
    terminal: "medrepo pull --all records",
  },
  {
    icon: Shield,
    title: "Fine-Grained Access Control",
    description:
      "Share specific records with any doctor, specialist, or caregiver. Revoke access anytime. You own your data.",
    terminal: "medrepo grant --read dr.smith@cardiology",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 glass-card border-b border-border/30">
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <div className="flex items-center gap-3">
            <img src={appIcon} alt="MedRepo icon" className="w-8 h-8 rounded-lg" />
            <span className="font-display font-bold text-lg text-foreground">
              Med<span className="text-primary">Repo</span>
            </span>
          </div>
          <button className="bg-primary text-primary-foreground px-5 py-2 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity">
            Get Early Access
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="container mx-auto max-w-5xl text-center relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="mb-8 inline-block"
          >
            <img
              src={appIcon}
              alt="MedRepo"
              className="w-28 h-28 rounded-3xl glow-coral animate-float"
            />
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={1}
          >
            <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-border bg-secondary/50">
              <span className="terminal-text">$ medrepo init --your-health</span>
            </div>
          </motion.div>

          <motion.h1
            className="text-5xl md:text-7xl font-display font-bold leading-tight mb-6"
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={2}
          >
            A Personal Medical Record
            <br />
            <span className="text-gradient-coral">That Moves with You</span>
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={3}
          >
            Version-controlled health records. Share with doctors on your terms.
            Your body, your data, your repository.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={4}
          >
            <button className="bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-semibold text-base hover:opacity-90 transition-opacity flex items-center gap-2 glow-coral">
              Join the Waitlist <ArrowRight className="w-4 h-4" />
            </button>
            <button className="border border-border text-foreground px-8 py-3.5 rounded-xl font-medium text-base hover:bg-secondary transition-colors">
              Learn More
            </button>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="container mx-auto max-w-5xl">
          <motion.div
            className="grid md:grid-cols-3 gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                variants={fadeUp}
                custom={i}
                className="glass-card rounded-2xl p-6 hover:border-primary/30 transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-3 text-foreground">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                  {feature.description}
                </p>
                <div className="rounded-lg bg-background/80 border border-border/50 px-3 py-2">
                  <code className="terminal-text text-xs">{feature.terminal}</code>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <motion.div
          className="container mx-auto max-w-3xl text-center glass-card rounded-3xl p-12 glow-coral"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4 text-foreground">
            Take Control of Your Health Data
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            Stop losing records between clinics. Start versioning your medical history like the critical data it is.
          </p>
          <button className="bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto">
            Get Early Access <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 px-6">
        <div className="container mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={appIcon} alt="MedRepo" className="w-5 h-5 rounded" />
            <span>MedRepo</span>
          </div>
          <span>© {new Date().getFullYear()} All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
