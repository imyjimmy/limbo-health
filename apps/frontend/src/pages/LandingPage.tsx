import { useState } from "react"
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { FeatureSection } from '@/components/landingpage/FeatureSection';
import FooterSection from "@/components/landingpage/FooterSection";
import { AuthState } from '@/types';

export function LandingPage() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>({
      isAuthenticated: false,
      token: null,
      pubkey: null,
      profile: null,
      role: null,
      needsOnboarding: {
        dashboard: false,
        billing: false,
        services: false,
        telehealth: false
      }
    });

  const handleNavigateToLogin = () => {
    console.log('handleGetStarted');
    navigate('/login');
  };
  
  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_pubkey');
    localStorage.removeItem('admin_profile');
    
    setAuthState({
      isAuthenticated: false,
      token: null,
      pubkey: null,
      profile: null,
      role: null,
      needsOnboarding: {
        dashboard: false,
        billing: false,
        services: false,
        telehealth: false
      }
    });
  };

  return (
    <div className="w-full bg-[#F7F5F3] flex flex-col">
      <Header 
        isAuthenticated={authState.isAuthenticated}
        profile={authState.profile}
        onLogout={handleLogout}
        compact={true}
      />
      
      {/* Hero Section - takes remaining viewport height */}
      <div className="min-h-[calc(100vh-56px)] flex-1 flex flex-col justify-center items-center px-4 sm:px-6 md:px-8 lg:px-0 max-w-[1060px] mx-auto w-full">
        {/* Your existing hero content goes here unchanged */}
        <div className="w-full max-w-[937px] lg:w-[937px] flex flex-col justify-center items-center gap-3 sm:gap-4 md:gap-5 lg:gap-6">
          <div className="self-stretch rounded-[3px] flex flex-col justify-center items-center gap-4 sm:gap-5 md:gap-6 lg:gap-8">
            <div className="w-full max-w-[748.71px] lg:w-[748.71px] text-center flex justify-center flex-col text-[#37322F] text-[24px] xs:text-[28px] sm:text-[36px] md:text-[52px] lg:text-[80px] font-sans leading-[1.1] sm:leading-[1.15] md:leading-[1.2] lg:leading-24 font-sans font-light px-2 sm:px-4 md:px-0">
              Modern Telemedicine
              <span className="font-cursive text-[24px]">with</span>
              <span className="font-anka">Old School Doctors</span>
            </div>
            <div className="w-full max-w-[506.08px] lg:w-[506.08px] text-center flex justify-center flex-col text-[rgba(55,50,47,0.80)] sm:text-lg md:text-xl leading-[1.4] sm:leading-[1.45] md:leading-[1.5] lg:leading-7 font-sans px-2 sm:px-4 md:px-0 lg:text-lg font-medium text-sm">
              Where Doctors and Patients Connect
              <br className="hidden sm:block" />
              Without Distractions
            </div>
          </div>
        </div>

        <div className="w-full max-w-[497px] lg:w-[497px] flex flex-col justify-center items-center gap-6 sm:gap-8 md:gap-10 lg:gap-12 relative z-10 mt-6 sm:mt-8 md:mt-10 lg:mt-12">
          <div className="backdrop-blur-[8.25px] flex justify-start items-center gap-4">
            <button onClick={handleNavigateToLogin}>
              <div className="h-10 sm:h-11 md:h-12 px-6 sm:px-8 md:px-10 lg:px-12 py-2 sm:py-[6px] relative bg-[#37322F] shadow-[0px_0px_0px_2.5px_rgba(255,255,255,0.08)_inset] overflow-hidden rounded-full flex justify-center items-center">
                <div className="w-20 sm:w-24 md:w-28 lg:w-44 h-[41px] absolute left-0 top-[-0.5px] bg-gradient-to-b from-[rgba(255,255,255,0)] to-[rgba(0,0,0,0.10)] mix-blend-multiply"></div>
                <div className="flex flex-col justify-center text-white text-sm sm:text-base md:text-[15px] font-medium leading-5 font-sans">
                  Expand Your Practice Online
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Background pattern - positioned relative to hero */}
        <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
          <img
            src="/mask-group-pattern.svg"
            alt=""
            className="w-[936px] sm:w-[1404px] md:w-[2106px] lg:w-[2808px] h-auto opacity-30 sm:opacity-40 md:opacity-50 mix-blend-multiply"
            style={{
              filter: "hue-rotate(15deg) saturate(0.7) brightness(1.2)",
            }}
          />
        </div>
      </div>

      {/* Features Section - appears on scroll */}
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-0 max-w-[1060px] mx-auto">
        <FeatureSection />
      </div>

      {/* Footer Section */}
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-0 max-w-[1060px] mx-auto">
        <FooterSection />
      </div>
    </div>
  )
}
