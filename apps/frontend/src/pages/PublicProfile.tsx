import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FooterSection from '@/components/landingpage/FooterSection';
import { ProviderProfile } from '@/types/profile';

export const PublicProfile: React.FC = () => {
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
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    if (username) {
      fetchProfile();
    }
  }, [username]);

  const handleBookAppointment = () => {
    // Navigate to booking page or show booking modal
    console.log('Book appointment with provider:', username);
    navigate(`/providers/${username}/book`);
  };

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
    <div className="w-full bg-[#F7F5F3] flex flex-col">
      
      {/* Profile Content Section */}
      <div className="bg-[#F7F5F3] py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto grid max-w-2xl grid-cols-1 items-start gap-x-8 gap-y-16 sm:gap-y-24 lg:mx-0 lg:max-w-none lg:grid-cols-2">
            
            {/* Left Column - Profile Card */}
            <div className="lg:pr-4">
              <div className="relative overflow-hidden rounded-3xl shadow-xl lg:max-w-lg aspect-square">
                {profile.profilePic ? (
                  <img 
                    src={profile.profilePic} 
                    alt={fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#37322F]/10 to-[#37322F]/20 flex items-center justify-center">
                    <span className="text-9xl font-bold text-[#37322F]">
                      {profile.firstName?.[0]}{profile.lastName?.[0]}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right Column - Details */}
            <div>
              <div className="text-base/7 text-[rgba(55,50,47,0.70)] lg:max-w-lg">
                <h1 className="mt-2 text-pretty text-4xl font-semibold tracking-tight text-[#37322F] sm:text-5xl">
                  {fullName}
                </h1>
                
                <div className="max-w-xl">
                  {profile.bio && (
                    <p className="mt-6">{profile.bio}</p>
                  )}

                  {(profile.primarySpecialty || profile.secondarySpecialty) && (
                    <p className="text-base/7 font-semibold text-[#37322F]/80">
                      {[profile.primarySpecialty, profile.secondarySpecialty].filter(Boolean).join(' • ')}
                    </p>
                  )}

                  {profile.medicalSchool && (
                    <div className="mt-8">
                      <h3 className="font-semibold text-[#37322F] mb-2">Education</h3>
                      <p>{profile.medicalSchool}</p>
                      {profile.graduationYear && (
                        <p className="text-sm mt-1">Class of {profile.graduationYear}</p>
                      )}
                    </div>
                  )}
                  
                  {profile.licenseState && profile.licenseNumber && (
                    <div className="mt-8">
                      <h3 className="font-semibold text-[#37322F] mb-2">License</h3>
                      <p>{profile.licenseState} #{profile.licenseNumber}</p>
                      {profile.registrationStatus && (
                        <p className="text-sm mt-1">{profile.registrationStatus}</p>
                      )}
                    </div>
                  )}

                  {profile.boardCertifications && profile.boardCertifications.length > 0 && (
                    <div className="mt-8">
                      <h3 className="font-semibold text-[#37322F] mb-2">Board Certifications</h3>
                      <ul className="space-y-1">
                        {profile.boardCertifications.map((cert, index) => (
                          <li key={index} className="text-sm">• {cert}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {profile.languages && profile.languages.length > 0 && (
                    <div className="mt-8">
                      <h3 className="font-semibold text-[#37322F] mb-2">Languages</h3>
                      <p>{profile.languages.join(', ')}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Stats Grid - if we have data to show */}
              {(profile.graduationYear || profile.licenseState || profile.yearOfBirth) && (
                <dl className="mt-10 grid grid-cols-2 gap-8 border-t border-[#37322F]/20 pt-10 sm:grid-cols-3">
                  {profile.graduationYear && (
                    <div>
                      <dt className="text-sm/6 font-semibold text-[rgba(55,50,47,0.60)]">Graduated</dt>
                      <dd className="mt-2 text-3xl/10 font-bold tracking-tight text-[#37322F]">
                        {profile.graduationYear}
                      </dd>
                    </div>
                  )}
                  
                  {profile.licenseState && (
                    <div>
                      <dt className="text-sm/6 font-semibold text-[rgba(55,50,47,0.60)]">Licensed in</dt>
                      <dd className="mt-2 text-3xl/10 font-bold tracking-tight text-[#37322F]">
                        {profile.licenseState}
                      </dd>
                    </div>
                  )}
                  
                  {profile.graduationYear && (
                    <div>
                      { profile.graduationYear && (<>
                        <dt className="text-sm/6 font-semibold text-[rgba(55,50,47,0.60)]">Experience</dt>
                      <dd className="mt-2 text-3xl/10 font-bold tracking-tight text-[#37322F]">
                        {new Date().getFullYear() - profile.graduationYear} years
                      </dd></>)
                      }
                    </div>
                  )}
                </dl>
              )}
              
              {/* Call to Action */}
              <div className="mt-10 flex">
                <button
                  onClick={handleBookAppointment}
                  className="h-12 px-8 bg-[#37322F] shadow-[0px_0px_0px_2.5px_rgba(255,255,255,0.08)_inset] rounded-full flex justify-center items-center hover:bg-[#4a4440] transition-colors relative overflow-hidden"
                >
                  <div className="w-44 h-[41px] absolute left-0 top-[-0.5px] bg-gradient-to-b from-[rgba(255,255,255,0)] to-[rgba(0,0,0,0.10)] mix-blend-multiply"></div>
                  <span className="text-white text-base font-medium relative z-10">
                    Book Appointment <span aria-hidden="true">→</span>
                  </span>
                </button>
              </div>
            </div>
            
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-0 max-w-[1060px] mx-auto">
        <FooterSection />
      </div>
    </div>
  );
}