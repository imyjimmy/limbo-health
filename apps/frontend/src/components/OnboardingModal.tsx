import { ReactNode } from 'react';

interface OnboardingModalProps {
  isOpen: boolean;
  title: string;  // Can be text or JSX now
  description?: string;
  children?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

export function OnboardingModal({
  isOpen,
  title,
  description,
  children,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  showCloseButton = false,
  onClose
}: OnboardingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-2xl w-full p-8 relative">
        {showCloseButton && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#37322F] mb-2">{title}</h1>
          {description && (
            <p className="text-[rgba(55,50,47,0.80)] text-lg">{description}</p>
          )}
        </div>
        
        {/* Custom content */}
        {children && <div className="mb-8">{children}</div>}
        
        {/* Actions */}
        <div className="space-y-3">
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="w-full bg-[#37322F] hover:bg-[rgba(55,50,47,0.90)] text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg"
            >
              {actionLabel}
            </button>
          )}
          
          {secondaryActionLabel && onSecondaryAction && (
            <button 
              onClick={onSecondaryAction}
              className="w-full border-2 border-[#37322F] text-[#37322F] hover:bg-[#F7F5F3] font-semibold py-4 px-6 rounded-lg transition-colors text-lg"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}