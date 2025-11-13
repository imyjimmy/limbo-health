interface Step {
  id: string;
  name: string;
  status: 'complete' | 'current' | 'upcoming';
}

interface ProgressBarProps {
  currentStep: number;
}

export function ProgressBar({ currentStep }: ProgressBarProps) {
  const steps: Step[] = [
    { id: 'Step 1', name: 'Provider & Service', status: currentStep > 1 ? 'complete' : currentStep === 1 ? 'current' : 'upcoming' },
    { id: 'Step 2', name: 'Select Time', status: currentStep > 2 ? 'complete' : currentStep === 2 ? 'current' : 'upcoming' },
    { id: 'Step 3', name: 'Admin Information', status: currentStep > 3 ? 'complete' : currentStep === 3 ? 'current' : 'upcoming' },
    { id: 'Step 4', name: 'Confirmation', status: currentStep === 4 ? 'current' : 'upcoming' },
  ];

  return (
    <nav aria-label="Progress" className="mb-8">
      <ol role="list" className="space-y-4 md:flex md:space-x-8 md:space-y-0">
        {steps.map((step) => (
          <li key={step.name} className="md:flex-1">
            {step.status === 'complete' ? (
              <div className="group flex flex-col border-l-4 border-indigo-600 py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4 dark:border-indigo-500">
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  {step.id}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{step.name}</span>
              </div>
            ) : step.status === 'current' ? (
              <div
                aria-current="step"
                className="flex flex-col border-l-4 border-indigo-600 py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4 dark:border-indigo-500"
              >
                <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{step.id}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{step.name}</span>
              </div>
            ) : (
              <div className="group flex flex-col border-l-4 border-gray-200 py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4 dark:border-white/10">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {step.id}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{step.name}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}