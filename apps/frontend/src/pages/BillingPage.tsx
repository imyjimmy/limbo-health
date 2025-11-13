import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, Copy, ExternalLink, Check, Send } from 'lucide-react';
import { OnboardingModal } from '@/components/OnboardingModal';

interface BillingPageProps {
  token: string;
}

interface BillingStats {
  total_appointments: number;
  pending_invoices: number;
  paid_invoices: number;
  total_revenue_sats: number;
}

interface PastAppointment {
  id: number;
  start_datetime: string;
  end_datetime: string;
  id_services: number;
  id_users_customer: number;
  id_users_provider: number;
  customer_name: string;
  customer_email: string;
  service_name: string;
  service_price: number;
  service_duration: number;
  has_invoice: boolean;
}

interface InvoiceDetails {
  id: number;
  appointment_id: number;
  amount_sats: number;
  payment_request: string;
  invoice_hash: string;
  status: string;
  created_at: string;
  paid_at?: string;
  appointment: {
    start_datetime: string;
    end_datetime: string;
    customer_name: string;
    customer_email: string;
    service_name: string;
    service_price: number;
    service_duration: number;
  };
}

export const BillingPage: React.FC<BillingPageProps> = ({ token }) => {
  const navigate = useNavigate();
  const { needsOnboarding, completeOnboarding } = useAuth();
  
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [currentProviderId, setCurrentProviderId] = useState<number | null>(null);
  const [pastAppointments, setPastAppointments] = useState<PastAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUserRegModal, setShowUserRegModal] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null, text: string }>({ type: null, text: '' });

  // viewing / sending invoices
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetails | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<number | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState<string | null>(null);
  const [sendingDM, setSendingDM] = useState<number | null>(null);

  const fetchBillingStats = async () => {
    try {
      const response = await fetch('/api/admin/billing/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch billing stats:', err);
    }
  };

  const fetchCurrentProvider = async () => {
    try {
      // Use /api/admin/me which works for both Google and Nostr users
      const response = await fetch('/api/admin/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if user exists and is a provider
        if (data.status === 'success' && data.user) {
          // Check if they're a provider (have a provider role)
          const isProvider = data.user.role && 
            (data.user.role.slug === 'provider' || 
            data.user.role.slug === 'admin-provider');
          
          if (isProvider) {
            setCurrentProviderId(data.user.id);
            completeOnboarding('billing');
            setShowUserRegModal(false);
          } else {

            // User exists but is not a provider - show registration modal
            setError('Please complete provider registration');
            setShowUserRegModal(true);
          }
        } else {
          // User exists but is not a provider
          // Check if this is their first time seeing ANY onboarding
          const isFirstTimeUser = needsOnboarding.dashboard && 
                                  needsOnboarding.billing && 
                                  needsOnboarding.services && 
                                  needsOnboarding.telehealth;
          
          if (isFirstTimeUser) {
            // First time - show modal
            setError('Complete registration to access billing');
            setShowUserRegModal(true);
          } else {
            // They've seen a modal before - just show error
            setError('Please complete registration');
            setShowUserRegModal(false);
          }
        }
      } else {
        setError('Failed to fetch user information');
        setShowUserRegModal(true);
      }
    } catch (err) {
      console.error('Failed to fetch current provider info:', err);
      setError('Network error fetching user info');
      setShowUserRegModal(true);
    }
  };

  const fetchPastAppointments = async (providerId: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/appointments/completed/${providerId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setPastAppointments(data.appointments);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to fetch appointments');
      }
    } catch (err) {
      console.error('Failed to fetch past appointments:', err);
      setError('Network error fetching appointments');
    } finally {
      setLoading(false);
    }
  };

  const createInvoiceForAppointment = async (appointment: PastAppointment) => {
    setCreatingInvoice(appointment.id);
    setMessage({ type: null, text: '' });

    try {
      const response = await fetch(`/api/admin/billing/appointments/${appointment.id}/invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amountSats: appointment.service_price,
          description: `${appointment.service_name} - ${appointment.customer_name}`
        })
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setMessage({
          type: 'success',
          text: `Invoice created for ${appointment.customer_name} - ${appointment.service_price} sats`
        });

        // Refresh the appointments list
        if (currentProviderId) {
          fetchPastAppointments(currentProviderId);
        }
        fetchBillingStats();
      } else {
        setMessage({
          type: 'error',
          text: data.message || 'Failed to create invoice'
        });
      }
    } catch (err) {
      console.error('Failed to create invoice:', err);
      setMessage({
        type: 'error',
        text: 'Network error creating invoice'
      });
    } finally {
      setCreatingInvoice(null);
    }
  };

  const viewInvoiceDetails = async (appointmentId: number) => {
    setViewingInvoice(appointmentId);
    try {
      const response = await fetch(`/api/admin/billing/appointments/${appointmentId}/invoice`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setSelectedInvoice(data.invoice);
          setShowInvoiceModal(true);
        } else {
          setMessage({
            type: 'error',
            text: data.message || 'Failed to fetch invoice details'
          });
        }
      } else {
        const errorData = await response.json();
        setMessage({
          type: 'error',
          text: errorData.message || 'Failed to fetch invoice details'
        });
      }
    } catch (err) {
      console.error('Failed to fetch invoice details:', err);
      setMessage({
        type: 'error',
        text: 'Network error fetching invoice details'
      });
    } finally {
      setViewingInvoice(null);
    }
  };

  const sendInvoiceDM = async (appointmentId: number) => {
    setSendingDM(appointmentId);
    try {
      const response = await fetch(`/api/admin/billing/appointments/${appointmentId}/send-dm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setMessage({
          type: 'success',
          text: data.message || 'Invoice DM sent successfully'
        });
      } else {
        setMessage({
          type: 'error',
          text: data.message || 'Failed to send invoice DM'
        });
      }
    } catch (err) {
      console.error('Failed to send invoice DM:', err);
      setMessage({
        type: 'error',
        text: 'Network error sending invoice DM'
      });
    } finally {
      setSendingDM(null);
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedToClipboard(type);
      setTimeout(() => setCopiedToClipboard(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const closeInvoiceModal = () => {
    setShowInvoiceModal(false);
    setSelectedInvoice(null);
    setCopiedToClipboard(null);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'text-green-400 bg-green-900';
      case 'pending':
        return 'text-yellow-400 bg-yellow-900';
      case 'expired':
        return 'text-red-400 bg-red-900';
      default:
        return 'text-gray-400 bg-gray-700';
    }
  };

  useEffect(() => {
    if (token) {
      fetchBillingStats();
      fetchCurrentProvider();
    }
  }, [token]);

  useEffect(() => {
    if (currentProviderId) {
      fetchPastAppointments(currentProviderId);
    }
  }, [currentProviderId]);

  const unbilledAppointments = pastAppointments.filter(apt => !apt.has_invoice);

return (
  <>
    <OnboardingModal
      isOpen={!!needsOnboarding['billing'] && showUserRegModal && !!token}
      title="No Provider Profile Found"
      description="You haven't completed your provider registration yet. Complete your profile to start accepting payments and managing invoices."
      actionLabel="Complete Profile Setup"
      onAction={() => navigate('/edit-profile')}
      secondaryActionLabel="Look Around First"
      onSecondaryAction={() => { 
        setShowUserRegModal(false) 
        completeOnboarding('billing')
      }}
      showCloseButton={true}
      onClose={() => { 
        setShowUserRegModal(false) 
        completeOnboarding('billing')
      }}
    >
      <div className="bg-[#F7F5F3] rounded-lg p-6">
        <p className="text-[#37322F] mb-4 font-medium">To enable billing features, you need to:</p>
        <ul className="space-y-3 text-[rgba(55,50,47,0.80)]">
          <li className="flex items-start">
            <span className="text-gray-600 mr-3 font-bold">•</span>
            <span>Complete your provider profile</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-600 mr-3 font-bold">•</span>
            <span>Set up payment information</span>
          </li>
          <li className="flex items-start">
            <span className="text-gray-600 mr-3 font-bold">•</span>
            <span>Configure your billing preferences</span>
          </li>
        </ul>
      </div>
    </OnboardingModal>
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <h2 className="text-2xl font-bold text-foreground mb-2">My Billing Dashboard</h2>
        <p className="text-muted-foreground">Create Lightning invoices for your completed appointments</p>
      </div>

      {/* Message Display */}
      {message.type && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-950 border border-green-800 text-green-400' 
            : 'bg-red-950 border border-red-800 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-950 border border-red-800">
          <p className="text-red-400">Error: {error}</p>
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl p-4 border border-border">
            <h3 className="text-muted-foreground text-sm">Total Appointments</h3>
            <p className="text-foreground text-2xl font-bold">{stats.total_appointments}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <h3 className="text-muted-foreground text-sm">Pending Invoices</h3>
            <p className="text-yellow-400 text-2xl font-bold">{stats.pending_invoices}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <h3 className="text-muted-foreground text-sm">Paid Invoices</h3>
            <p className="text-green-400 text-2xl font-bold">{stats.paid_invoices}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <h3 className="text-muted-foreground text-sm">Revenue (Sats)</h3>
            <p className="text-purple-400 text-2xl font-bold">{stats.total_revenue_sats}</p>
          </div>
        </div>
      )}

      {/* Past Appointments - Unbilled */}
      {currentProviderId && (
        <div className="bg-card rounded-xl border border-border">
          <div className="p-6 border-b border-border">
            <h3 className="text-xl font-semibold text-foreground">Unbilled Appointments!!</h3>
            <p className="text-muted-foreground text-sm mt-1">Your completed appointments ready for billing</p>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading appointments...</span>
              </div>
            ) : unbilledAppointments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No unbilled appointments found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {unbilledAppointments.map((appointment) => (
                  <div key={appointment.id} className="bg-muted/50 rounded-lg p-4 border border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-foreground font-medium">
                            {appointment.customer_name}
                          </h4>
                          <span className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded-full">
                            {appointment.service_name}
                          </span>
                        </div>
                        
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>Date: {new Date(appointment.start_datetime).toLocaleString()}</div>
                          <div>Duration: {appointment.service_duration} minutes</div>
                          <div>Amount: {appointment.service_price} sats</div>
                          <div>Customer: {appointment.customer_email}</div>
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        <button
                          onClick={() => createInvoiceForAppointment(appointment)}
                          disabled={creatingInvoice === appointment.id}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            creatingInvoice !== appointment.id
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-muted text-muted-foreground cursor-not-allowed'
                          }`}
                        >
                          {creatingInvoice === appointment.id ? (
                            <div className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground"></div>
                              Creating...
                            </div>
                          ) : (
                            'Create Invoice'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recently Billed Appointments */}
      {currentProviderId && (
        <div className="bg-card rounded-xl border border-border">
          <div className="p-6 border-b border-border">
            <h3 className="text-xl font-semibold text-foreground">Recently Billed</h3>
            <p className="text-muted-foreground text-sm mt-1">Your appointments that have been invoiced</p>
          </div>          
          <div className="p-6">            
            <div className="space-y-3">
              {pastAppointments
                .map((appointment) => (
                  <div key={appointment.id} className="bg-muted/50 rounded-lg p-4 border border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-foreground font-medium mb-1">
                          {appointment.customer_name}
                        </h4>
                        <div className="text-sm text-muted-foreground">
                          {appointment.service_name} • {new Date(appointment.start_datetime).toLocaleDateString()} • {appointment.service_price} sats
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-green-950 text-green-400 text-xs rounded-full">
                          Invoiced
                        </span>
                        <button
                          onClick={() => viewInvoiceDetails(appointment.id)}
                          disabled={viewingInvoice === appointment.id}
                          className="flex items-center gap-1 px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-lg transition-colors disabled:opacity-50"
                        >
                          {viewingInvoice === appointment.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border border-primary-foreground border-b-transparent"></div>
                          ) : (
                            <Eye size={12} />
                          )}
                          View Invoice
                        </button>
                        <button
                          onClick={() => sendInvoiceDM(appointment.id)}
                          disabled={sendingDM === appointment.id}
                          className="flex items-center gap-1 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
                        >
                          {sendingDM === appointment.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border border-white border-b-transparent"></div>
                          ) : (
                            <Send size={12} />
                          )}
                          Send DM
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Invoice Details Modal */}
      {showInvoiceModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-foreground">Invoice Details</h3>
                <button
                  onClick={closeInvoiceModal}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Invoice Summary */}
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-foreground font-medium">Invoice #{selectedInvoice.id}</h4>
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(selectedInvoice.status)}`}>
                    {selectedInvoice.status.charAt(0).toUpperCase() + selectedInvoice.status.slice(1)}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="text-foreground ml-2 font-medium">{selectedInvoice.amount_sats} sats</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <span className="text-foreground ml-2">{new Date(selectedInvoice.created_at).toLocaleString()}</span>
                  </div>
                  {selectedInvoice.paid_at && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Paid:</span>
                      <span className="text-green-400 ml-2">{new Date(selectedInvoice.paid_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Request */}
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-foreground font-medium">Lightning Invoice</h4>
                  <button
                    onClick={() => copyToClipboard(selectedInvoice.payment_request, 'invoice')}
                    className="flex items-center gap-1 px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded transition-colors"
                  >
                    {copiedToClipboard === 'invoice' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedToClipboard === 'invoice' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="bg-muted rounded p-3 border border-border">
                  <code className="text-xs text-muted-foreground break-all">
                    {selectedInvoice.payment_request}
                  </code>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  onClick={closeInvoiceModal}
                  className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors"
                >
                  Close
                </button>
                {selectedInvoice.status === 'pending' && (
                  <button
                    onClick={() => window.open(`lightning:${selectedInvoice.payment_request}`, '_blank')}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                  >
                    <ExternalLink size={16} />
                    Pay with Lightning
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  </>
  );
};