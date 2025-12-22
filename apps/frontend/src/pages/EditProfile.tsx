import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { profileService } from '@/services/profile';
import { ProviderProfile } from '@/types/profile';
import { ArrowLeft, UserCircle } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { isNostrProfile, isGoogleProfile } from '@/lib/utils';

interface EditProfileProps {
  token: string;
  onSave?: () => void;
}

export const EditProfile: React.FC<EditProfileProps> = ({ token, onSave }) => {
  const navigate = useNavigate();
  const { profile: nostrProfile, refreshProfile, setSession, pubkey, role } = useAuth();
  const [profile, setProfile] = useState<Partial<ProviderProfile>&{ nostrPubkey?: string | null }>({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'credentials' | 'additional'>('basic');
  const [validationError, setValidationError] = useState<string>('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await profileService.getProfile(token);
      // setProfile(data);
      setProfile({
        ...data,
        profilePic: data.profilePic || (nostrProfile && isNostrProfile(nostrProfile) ? nostrProfile.picture : '') || ''
      });
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('profile_pic', file);

      const response = await fetch('/api/admin/provider/profile-pic', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      updateField('profilePic', data.url);

      // Update the auth context with new profile picture
      const currentProfile = JSON.parse(localStorage.getItem('admin_profile') || '{}');
      const updatedProfile = { ...currentProfile, picture: data.url };
      localStorage.setItem('admin_profile', JSON.stringify(updatedProfile));
      
      // Update session to trigger re-render in components using useAuth
      setSession(token,
        pubkey || '',
        updatedProfile,
        role,
        undefined // Don't change onboarding flags
      );

      alert('Profile picture updated!');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload profile picture');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (activeTab === 'basic' && !validateBasicInfo()) {
      return;
    }

    setSaving(true);
    try {
      // Map frontend fields to backend snake_case
      const payload = {
        username: profile.username,
        first_name: profile.firstName,
        last_name: profile.lastName,
        bio: profile.bio,
        suffix: profile.suffix,
        license_number: profile.licenseNumber,
        license_state: profile.licenseState,
        license_issued_date: profile.licenseIssuedDate,
        license_expiration_date: profile.licenseExpirationDate,
        registration_status: profile.registrationStatus,
        registration_date: profile.registrationDate,
        method_of_licensure: profile.methodOfLicensure,
        medical_school: profile.medicalSchool,
        graduation_year: profile.graduationYear,
        degree_type: profile.degreeType,
        primary_specialty: profile.primarySpecialty,
        secondary_specialty: profile.secondarySpecialty,
        year_of_birth: profile.yearOfBirth,
        place_of_birth: profile.placeOfBirth,
        gender: profile.gender,
      };

      await profileService.updateProfile(token, payload);
      await refreshProfile();
      alert('Profile saved successfully!');
      if (onSave) onSave();
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof ProviderProfile, value: any) => {
    setProfile({ ...profile, [field]: value });
  };

  const validateBasicInfo = (): boolean => {
    const errors: string[] = [];
    
    if (!profile.username?.trim()) {
      errors.push('Username');
    }
    if (!profile.firstName?.trim()) {
      errors.push('First Name');
    }
    if (!profile.lastName?.trim()) {
      errors.push('Last Name');
    }
    
    if (errors.length > 0) {
      setValidationError(`Please fill in required fields: ${errors.join(', ')}`);
      return false;
    }
    
    setValidationError('');
    return true;
  };

  const handleGenerateNostr = async () => {
    try {
      const response = await fetch('/api/auth/generate-nostr', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setProfile({...profile, nostrPubkey: data.pubkey});
        console.log('Success', 'Nostr profile generated! You can now use WebRTC features.');
        // Refresh user profile
        await profileService.getProfile(token);
      }
    } catch (error) {
      console.error('Error', 'Failed to generate Nostr profile');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-900 dark:text-white">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background transition-colors">
      {/* Header with Back Button */}
      <div className="bg-card border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to Dashboard</span>
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Edit Profile</h1>
          </div>
          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </div>
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-card rounded-xl border overflow-hidden">
          {/* Tabs */}
          <div className="border-b flex gap-1 px-6 bg-card">
            {[
              { id: 'basic', label: 'Basic Info' },
              { id: 'credentials', label: 'License & Education' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Validation Error */}
          {validationError && (
            <div className="px-6 pt-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-800 dark:text-red-200">{validationError}</p>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="p-6 bg-card">
            {/* Basic Info Tab */}
            {activeTab === 'basic' && (
              <div className="space-y-12">
                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">Profile!!!</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      This information will be displayed publicly.
                    </p>
                  </div>

                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
                    <div className="sm:col-span-4">
                      <label htmlFor="username" className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                        Username <span className="text-red-500">*</span>
                      </label>
                      <div className="mt-2">
                        <div className="flex items-center rounded-md bg-white pl-3 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:bg-white/5 dark:outline-white/10 dark:focus-within:outline-indigo-500">
                          <div className="shrink-0 select-none text-base text-gray-500 sm:text-sm/6 dark:text-gray-400">
                            plebdoc.com/
                          </div>
                          <input
                            id="username"
                            name="username"
                            onChange={(e) => updateField('username', e.target.value)}
                            type="text"
                            placeholder="janesmith"
                            value={profile.username || ''}
                            className="block min-w-0 grow bg-white py-1.5 pl-1 pr-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline focus:outline-0 sm:text-sm/6 dark:bg-transparent dark:text-white dark:placeholder:text-gray-500"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-full">
                      <label htmlFor="photo" className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                        Photo
                      </label>
                      <div className="mt-2 flex items-center gap-x-3">
                        {profile.profilePic ? (
                          <img 
                            src={profile.profilePic} 
                            alt="Profile" 
                            className="size-12 rounded-full object-cover"
                          />
                        ) : (
                          <UserCircle aria-hidden="true" className="size-12 text-gray-300 dark:text-gray-500" />
                        )}
                        <label className="cursor-pointer rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:shadow-none dark:ring-white/5 dark:hover:bg-white/20">
                          {uploadingPhoto ? 'Uploading...' : 'Change'}
                          <input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                            onChange={handlePhotoUpload}
                            disabled={uploadingPhoto}
                            className="sr-only"
                          />
                        </label>
                        {profile.profilePic === (nostrProfile && isNostrProfile(nostrProfile) ? nostrProfile.picture : undefined) && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Using your Nostr profile picture</p>
                        )}
                      </div>
                    </div>
                    <div className="col-span-full">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Professional Biography
                      </label>
                      <textarea
                        value={profile.bio || ''}
                        onChange={(e) => updateField('bio', e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Tell patients about your experience, approach to care, and what makes your practice unique..."
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-200 dark:border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">Personal Information</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      Some basic information about you.
                    </p>
                  </div>

                  { /* First Name, Last Name, suffix. */}
                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-8 md:col-span-2">
                    <div className="sm:col-span-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={profile.firstName || ''}
                          onChange={(e) => updateField('firstName', e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                          placeholder="John"
                          required
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Last Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={profile.lastName || ''}
                          onChange={(e) => updateField('lastName', e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                          placeholder="Smith"
                          required
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-1">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Suffix
                        </label>
                        <input
                          type="text"
                          value={profile.suffix || ''}
                          onChange={(e) => updateField('suffix', e.target.value)}
                          maxLength={3}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                          placeholder="Jr"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {isGoogleProfile(nostrProfile) && (
                  <div>
                    {profile.nostrPubkey ? (
                      <div>✓ Nostr: {profile.nostrPubkey.substring(0, 16)}...</div>
                    ) : (
                      <div>
                        <button onClick={handleGenerateNostr}>Generate</button>
                        {/* <button onClick={handleLinkNostr}>Link</button> */}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-200 dark:border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">Details</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      Completely optional, it helps our patients know you on a deeper level.
                    </p>
                  </div>

                  { /* Gender, Year of Birth, Place of Birth. */}
                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-8 md:col-span-2">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Gender
                      </label>
                      <select
                        value={profile.gender || ''}
                        onChange={(e) => updateField('gender', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                      >
                        <option value="">Select...</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Year of Birth
                      </label>
                      <input
                        type="number"
                        value={profile.yearOfBirth || ''}
                        onChange={(e) => updateField('yearOfBirth', parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="1975"
                        min="1920"
                        max={new Date().getFullYear()}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Place of Birth
                      </label>
                      <input
                        type="text"
                        value={profile.placeOfBirth || ''}
                        onChange={(e) => updateField('placeOfBirth', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Texas, USA"
                        maxLength={30}
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Languages Spoken
                      </label>
                      <input
                        type="text"
                        value={profile.languages?.join(', ') || ''}
                        onChange={(e) => updateField('languages', e.target.value.split(',').map(s => s.trim()))}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="English, Spanish, French"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Separate with commas</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Credentials Tab */}
            {activeTab === 'credentials' && (
              <div className="space-y-12">
                {/* Medical License */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-200 dark:border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">Medical License</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      State-issued license required for practice.
                    </p>
                  </div>

                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        License Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={profile.licenseNumber || ''}
                        onChange={(e) => updateField('licenseNumber', e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="K9472"
                        maxLength={9}
                        required
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        License State
                      </label>
                      <input
                        type="text"
                        value={profile.licenseState || 'TX'}
                        onChange={(e) => updateField('licenseState', e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="TX"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>

                {/* Medical Education */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-200 dark:border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">Medical Education</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      Provide your medical school details and degree.
                    </p>
                  </div>

                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
                    <div className="col-span-full">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Medical School <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={profile.medicalSchool || ''}
                        onChange={(e) => updateField('medicalSchool', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Baylor College of Medicine, Houston, TX"
                        maxLength={67}
                        required
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Graduation Year <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={profile.graduationYear || ''}
                        onChange={(e) => updateField('graduationYear', parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="2000"
                        min="1950"
                        max={new Date().getFullYear()}
                        required
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Degree Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={profile.degreeType || ''}
                        onChange={(e) => updateField('degreeType', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        required
                      >
                        <option value="">Select...</option>
                        <option value="MD">MD</option>
                        <option value="DO">DO</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Specialties */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-200 dark:border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">Specialties</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      Add your primary and secondary specialties.
                    </p>
                  </div>

                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Primary Specialty
                      </label>
                      <input
                        type="text"
                        value={profile.primarySpecialty || ''}
                        onChange={(e) => updateField('primarySpecialty', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Internal Medicine"
                        maxLength={30}
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Secondary Specialty
                      </label>
                      <input
                        type="text"
                        value={profile.secondarySpecialty || ''}
                        onChange={(e) => updateField('secondarySpecialty', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Sleep Medicine"
                        maxLength={30}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Board Certifications
                      </label>
                      <textarea
                        value={profile.boardCertifications?.join('\n') || ''}
                        onChange={(e) => updateField('boardCertifications', e.target.value.split('\n').filter(s => s.trim()))}
                        rows={3}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 font-mono text-sm"
                        placeholder="American Board of Internal Medicine&#10;American Board of Sleep Medicine"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">One certification per line</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t p-6 flex justify-between items-center bg-card">
            <a
              href={`/providers/${profile.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm"
            >
              View Public Profile →
            </a>
            
            {activeTab === 'basic' ? (
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Progress'}
                </button>
                <button
                  onClick={() => setActiveTab('credentials')}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  Add Credentials →
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab('basic')}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Publishing...' : 'Publish Profile'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};