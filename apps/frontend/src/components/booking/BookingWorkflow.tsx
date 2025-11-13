import { useState } from 'react';
import { ProgressBar } from './ProgressBar';
import { Step1ProviderService } from './Step1ProviderService';
import { Step2Availability } from './Step2Availability';
import { Step3PatientInfo } from './Step3PatientInfo';
import { Step4Confirmation } from './Step4Confirmation';

export interface BookingData {
  provider: { id: string; name: string; email?: string } | null;
  service: { id: string; name: string; duration: number; price?: string } | null;
  appointment: { date: string; time: string; timezone: string; isDST: boolean; datetime: string } | null;
  patient: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    nostrPubkey?: string;
    notes?: string;
  } | null;
}

interface BookingWorkflowProps {
  providerId: string;
}

export function BookingWorkflow({ providerId }: BookingWorkflowProps) {  
  const [currentStep, setCurrentStep] = useState(1);
  const [bookingData, setBookingData] = useState<BookingData>({
    provider: null,
    service: null,
    appointment: null,
    patient: null,
  });

  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateBookingData = (updates: Partial<BookingData>) => {
    setBookingData(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="py-6">
      <ProgressBar currentStep={currentStep} />
      <div className="w-3/4 mx-auto bg-card shadow-lg border rounded-lg p-6">
        {currentStep === 1 && (
          <Step1ProviderService
            providerId={String(providerId)}
            data={bookingData}
            onNext={nextStep}
            onUpdate={updateBookingData}
          />
        )}
        
       {currentStep === 2 && (
          <Step2Availability
            data={bookingData}
            onNext={nextStep}
            onPrev={prevStep}
            onUpdate={updateBookingData}
          />
        )}
        
        {currentStep === 3 && (
          <Step3PatientInfo
            data={bookingData}
            onNext={nextStep}
            onPrev={prevStep}
            onUpdate={updateBookingData}
          />
        )}
         
        {currentStep === 4 && (
          <Step4Confirmation
            data={bookingData}
            onPrev={prevStep}
            onUpdate={updateBookingData}
          />
        )}
      </div>
    </div>
  );
}