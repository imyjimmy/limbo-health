import React, { useState } from 'react';
// import { Header } from '../components/Header';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/dashboard/AppSidebar';
import { SiteHeader } from '@/components/SiteHeader';

import { MedicalRepos } from '@/components/MedicalRepos';
import { Settings } from '@/components/Settings';
import { CalendarPage } from '@/pages/CalendarPage';
import { BillingPage } from '@/pages/BillingPage';
import { ServicesManager } from '@/components/ServicesManager';
import { OnboardingModal } from '@/components/OnboardingModal';

import { WebRTCTest } from '../components/WebRTCTest';
// import { DatabaseTest } from '../components/DatabaseTest';
import { SignatureDeterminismTest } from '../components/test-signature-determinism';
// import { RegistrationView } from '../components/RegistrationView';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
// import { NostrAuthService } from '../services/auth';

interface AdminDashboardProps {
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({onLogout}) => {
  const navigate = useNavigate();
  const { isAuthenticated, token, pubkey, profile, needsOnboarding, completeOnboarding, role } = useAuth();
  // const [showUserRegModal, setShowUserRegModal] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState('webrtc');

  return (
    <>
      {/* Onboarding Modal Overlay */}
      <OnboardingModal
        isOpen={!!needsOnboarding['dashboard'] && !!token}
        
        title="Welcome to Limbo Health!"
        description="Let's set up your doctor profile so patients can book with you."
        actionLabel="Complete Profile Setup →"
        onAction={() => {
          // setSession(token || '', pubkey || '', profile);
          completeOnboarding('dashboard');
          navigate('/edit-profile');
        }}
        secondaryActionLabel="Look Around First"
        onSecondaryAction={() => { 
          // setShowUserRegModal(false) 
          completeOnboarding('dashboard')
        }}
        showCloseButton={true}
        onClose={() => { 
          completeOnboarding('dashboard')
        }}
      >
        <div className="bg-[#F7F5F3] rounded-lg p-6">
          <p className="text-[#37322F] mb-4 font-medium">This takes about 2 minutes:</p>
          <ul className="space-y-3 text-[rgba(55,50,47,0.80)]">
            <li className="flex items-start">
              <span className="text-gray-600 mr-3 font-bold">•</span>
              <span>Add bio & profile picture</span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-600 mr-3 font-bold">•</span>
              <span>Set your working hours</span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-600 mr-3 font-bold">•</span>
              <span>Create your first service</span>
            </li>
          </ul>
        </div>
      </OnboardingModal>

      {/* Normal Dashboard */}
      <SidebarProvider
        style={{
          "--sidebar-width": "16rem",
          "--header-height": "3rem",
        } as React.CSSProperties}
      >
        <AppSidebar 
          authState={{ isAuthenticated, token, pubkey, profile, role, needsOnboarding }}
          activeSection={activeSection}
          onLogout={onLogout}
          onSectionChange={setActiveSection}
        />
        <SidebarInset>
          { /* 
            MAIN AREA 
            NOT the sidebar itself, but Components listed here are VIEWABLE in the main area
            after being selected via the sidebar
          */}

          <SiteHeader 
            authState={{ isAuthenticated, token, pubkey, profile, needsOnboarding, role }}
            onLogout={onLogout}
            activeSection={activeSection}
            toggleHeader={false}
          />
          
          <div className="flex-1 overflow-auto p-6">
            {activeSection === 'webrtc' && token && (
              <WebRTCTest token={token} />
            )}
            {activeSection === 'calendar' && token && (
              <CalendarPage token={token} />
            )}
            {activeSection === 'settings' && token && (
              <Settings token={token} />
            )}
            {activeSection === 'database' && <SignatureDeterminismTest />}
            {activeSection === 'repositories' && token && (
              <MedicalRepos token={token} />
            )}
            {activeSection === 'billing' && token && (
              <BillingPage token={token} />
            )}
            {activeSection === 'services' && token && (
              <ServicesManager token={token} />
            )}
            {/* {activeSection === 'appointments' && authState.token && (
              <BookingWorkflow token={authState.token} />
            )} */}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
};

export default AdminDashboard