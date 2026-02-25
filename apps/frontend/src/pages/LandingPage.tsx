import type { ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconArrowRight,
  IconCpu,
  IconSpeakerphone,
  IconWorld,
} from '@tabler/icons-react';

type Feature = {
  icon: ElementType;
  title: string;
  description: string;
  terminal?: string;
};

const features: Feature[] = [
  {
    icon: IconSpeakerphone,
    title: 'A Medical Advocate at the Palm of Your Hands',
    description:
      'Bring timestamps, symptom history, meds, and outcomes into every visit so your concerns are harder to dismiss.',
    // terminal: 'git log --oneline medical-history',
  },
  {
    icon: IconWorld,
    title: 'A Personal Medical Record That Moves with You.',
    description:
      'Carry your complete medical record everywhere. Instant access during emergencies, travel, or new doctor visits.',
    // terminal: 'git pull --all records',
  },
  {
    icon: IconCpu,
    title: 'The Missing Foundation for AI Medicine',
    description:
      'Portable personal medical records unlock AI medicine: richer context, earlier insights, and safer, personalized care.',
    // terminal: 'git summarize --history --for ai-doctor',
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const appIconSrc = '/medrepo-icon.png';

  const handleNavigateToLogin = () => {
    navigate('/login');
  };

  const handleScrollToFeatures = () => {
    document.getElementById('landing-features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,hsl(220_20%_12%)_0%,hsl(220_20%_8%)_38%,hsl(220_20%_7%)_100%)] text-[#f6efe7]">
      <nav className="fixed top-0 z-50 w-full border-b border-[rgba(255,255,255,0.08)] bg-[rgba(12,15,21,0.72)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1060px] items-center justify-between px-4 py-4 sm:px-6 md:px-8 lg:px-0">
          <div className="flex items-center gap-3">
            <img src={appIconSrc} alt="MedRepo icon" className="h-9 w-9 rounded-lg" />
            <span className="font-berkeley text-lg tracking-[0.03em]">
              Limbo<span className="text-[#ff7d66]">Health</span>
            </span>
          </div>
          <button
            onClick={handleNavigateToLogin}
            className="rounded-lg bg-[#ff6f57] px-5 py-2 text-sm font-semibold text-[#fff5ec] shadow-[0_6px_14px_rgba(189,69,45,0.22)] transition-opacity hover:opacity-90"
          >
            Enter Doctor Portal
          </button>
        </div>
      </nav>

      <section className="relative px-4 pb-20 pt-32 sm:px-6 md:px-8 lg:px-0">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/4 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,127,103,0.10)_0%,_rgba(255,127,103,0)_72%)] blur-xl" />
        </div>

        <div className="relative mx-auto flex w-full max-w-[1060px] flex-col items-center text-center">
          <div className="mb-8 flex justify-center">
            <img
              src={appIconSrc}
              alt="MedRepo"
              className="h-24 w-24 rounded-3xl shadow-[0_4px_10px_rgba(217,82,55,0.14)] sm:h-28 sm:w-28"
            />
          </div>

          <div className="mb-6 flex justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] px-4 py-1.5">
            <span className="font-anka text-xs text-[#ffd9cf] sm:text-sm">$ git init --your-health</span>
          </div>

          <h1 className="mb-6 flex flex-col items-center text-4xl font-light leading-tight sm:text-6xl md:text-7xl">
            <span>Your Medical History</span>
            <span className="font-cursive text-2xl italic leading-tight sm:text-3xl md:text-4xl">as a</span>
            <span className="font-anka tracking-[0.03em]">Git Repo</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-[rgba(246,239,231,0.74)] md:text-xl">
            Access to your own Medical Records has always been Fragmented and Painful. Not anymore.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={handleNavigateToLogin}
              className="flex items-center gap-2 rounded-xl bg-[#ff725a] px-8 py-3.5 text-base font-semibold text-[#fff5ec] shadow-[0_8px_18px_rgba(169,56,34,0.28)] transition-opacity hover:opacity-90"
            >
              Get the App <IconArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={handleScrollToFeatures}
              className="rounded-xl border border-[rgba(255,255,255,0.20)] bg-[rgba(255,255,255,0.03)] px-8 py-3.5 text-base font-medium text-[#f6efe7] transition-colors hover:bg-[rgba(255,255,255,0.10)]"
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      <section id="landing-features" className="px-4 py-24 sm:px-6 md:px-8 lg:px-0">
        <div className="mx-auto grid w-full max-w-[1060px] gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] p-6 backdrop-blur-md transition-colors hover:border-[rgba(255,127,103,0.48)]"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(255,127,103,0.08)] transition-colors group-hover:bg-[rgba(255,127,103,0.14)]">
                <feature.icon className="h-6 w-6 text-[#ff8d76]" />
              </div>
              <h3 className="mb-3 text-lg font-semibold text-[#fff3e9]">{feature.title}</h3>
              <p className="mb-4 text-sm leading-relaxed text-[rgba(246,239,231,0.72)]">{feature.description}</p>
              {/* <div className="rounded-lg border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.24)] px-3 py-2">
                <code className="font-anka text-xs text-[#ffcebf]">{feature.terminal}</code>
              </div> */}
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-24 sm:px-6 md:px-8 lg:px-0">
        <div className="mx-auto w-full max-w-3xl rounded-3xl border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] p-8 text-center shadow-[0_0_38px_rgba(255,126,102,0.10)] backdrop-blur-md sm:p-12">
          <h2 className="mb-4 text-3xl font-semibold text-[#fff3e9] md:text-4xl">
            Take Control of Your Health Data
          </h2>
          <p className="mx-auto mb-8 max-w-lg text-[rgba(246,239,231,0.72)]">
            Stop losing records between clinics. Start versioning your medical history like the critical data it is. Your body, your data.
          </p>
          <button
            onClick={handleNavigateToLogin}
            className="mx-auto flex items-center gap-2 rounded-xl bg-[#ff725a] px-8 py-3.5 font-semibold text-[#fff5ec] transition-opacity hover:opacity-90"
          >
            Enter Doctor Portal <IconArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <footer className="border-t border-[rgba(255,255,255,0.10)] px-4 py-8 sm:px-6 md:px-8 lg:px-0">
        <div className="mx-auto flex w-full max-w-[1060px] items-center justify-between text-sm text-[rgba(246,239,231,0.62)]">
          <div className="flex items-center gap-2">
            <img src={appIconSrc} alt="MedRepo" className="h-5 w-5 rounded" />
            <span>Limbo Health</span>
          </div>
          <span>© {new Date().getFullYear()} All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
