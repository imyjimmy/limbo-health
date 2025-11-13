import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FooterSection from '@/components/landingpage/FooterSection';
import { BookingWorkflow } from '@/components/booking/BookingWorkflow';
import { ProviderProfile } from '@/types/profile';

export function BookAppointment() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`/api/admin/provider/${username}/profile`);
        if (!response.ok) {
          throw new Error('Provider not found');
        }
        const data = await response.json();
        setProfile(data.profile);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load provider');
      } finally {
        setLoading(false);
      }
    };

    if (username) {
      fetchProfile();
    }
  }, [username]);

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-[#F7F5F3] flex items-center justify-center">
        <div className="text-[#37322F] text-lg">Loading...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="w-full min-h-screen bg-[#F7F5F3] flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="text-[#37322F] text-xl mb-4">
            {error || 'Provider not found'}
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-[#37322F] underline hover:no-underline"
          >
            Return to home
          </button>
        </div>
      </div>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName}${profile.suffix ? ', ' + profile.suffix : ''}`;

  return (
    <div className="w-full bg-[#F7F5F3] flex flex-col min-h-screen">
      
      {/* Booking Content */}
      <div className="flex-1 py-12 sm:py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          
          {/* Provider Info Header */}
          <div className="mx-auto max-w-2xl text-center mb-12">
            <div className="text-base/7 font-semibold text-[#37322F]/80">
              Book an Appointment
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#37322F] sm:text-4xl">
              {fullName}
            </h1>
            {profile.primarySpecialty && (
              <p className="mt-2 text-lg text-[rgba(55,50,47,0.70)]">
                {profile.primarySpecialty}
              </p>
            )}
          </div>

          {/* Booking Workflow */}
          <div className="mx-auto max-w-4xl">
            <BookingWorkflow
              providerId={String(profile.userId)}
            />
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-0 max-w-[1060px] mx-auto">
        <FooterSection />
      </div>

      {/* Background pattern */}
      <div className="fixed inset-0 flex justify-center items-center pointer-events-none -z-10">
        <img
          src="/mask-group-pattern.svg"
          alt=""
          className="w-[936px] sm:w-[1404px] md:w-[2106px] lg:w-[2808px] h-auto opacity-10 sm:opacity-15 md:opacity-20 mix-blend-multiply"
          style={{
            filter: "hue-rotate(15deg) saturate(0.7) brightness(1.2)",
          }}
        />
      </div>
    </div>
  );
}