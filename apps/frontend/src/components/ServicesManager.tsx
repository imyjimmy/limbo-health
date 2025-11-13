import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { OnboardingModal } from '@/components/OnboardingModal';

interface Service {
  id?: number;
  name: string;
  duration: number;
  price: number;
  currency: string;
  description: string;
  location: string;
  color: string;
  availabilities_type: 'flexible' | 'fixed';
  attendants_number: number;
  id_service_categories: number | null;
  is_private: boolean;
  create_datetime?: string;
  update_datetime?: string;
}

interface ServiceCategory {
  id: number;
  name: string;
  description?: string;
}

const defaultService: Omit<Service, 'id'> = {
  name: '',
  duration: 30,
  price: 0,
  currency: 'sats',
  description: '',
  location: '',
  color: '#3fbd5e',
  availabilities_type: 'flexible',
  attendants_number: 1,
  id_service_categories: null,
  is_private: false
};

interface ServicesProp {
  token: string;
}

export const ServicesManager: React.FC<ServicesProp> = ({ token }) => {
  const navigate = useNavigate();
  const { needsOnboarding, completeOnboarding } = useAuth();
  const [showUserRegModal, setShowUserRegModal] = useState<boolean>(false);
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load services and categories on component mount
  useEffect(() => {
    loadServices();
    loadCategories();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/services', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        // Ensure numeric fields are properly typed
        const typedServices = (data.services || []).map((service: any) => ({
          ...service,
          price: Number(service.price) || 0,
          duration: Number(service.duration) || 0,
          attendants_number: Number(service.attendants_number) || 1,
          id_service_categories: service.id_service_categories ? Number(service.id_service_categories) : null
        }));
        setServices(typedServices);
      } else {
        if (data.message === 'Provider not found') {
          setShowUserRegModal(true);
        }
        throw new Error(data.message || 'Failed to load services');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/service-categories', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.status === 'success') {
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.warn('Failed to load categories:', err);
      setCategories([]);
    }
  };

  const saveService = async (service: Omit<Service, 'id'> | Service) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('admin_token');
      const isEditing = 'id' in service && service.id;
      
      const response = await fetch(`/api/admin/services${isEditing ? `/${service.id}` : ''}`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(service)
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        await loadServices(); // Reload the list
        setEditingService(null);
        setIsCreating(false);
        setError(null);
      } else {
        throw new Error(data.message || 'Failed to save service');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save service');
    } finally {
      setLoading(false);
    }
  };

  const deleteService = async (serviceId: number) => {
    if (!window.confirm('Are you sure you want to delete this service?')) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/services/${serviceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        await loadServices();
        setError(null);
      } else {
        throw new Error(data.message || 'Failed to delete service');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete service');
    } finally {
      setLoading(false);
    }
  };

  const startCreating = () => {
    setEditingService({ ...defaultService, id: undefined } as Service);
    setIsCreating(true);
    setError(null);
  };

  const startEditing = (service: Service) => {
    setEditingService({ ...service });
    setIsCreating(false);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingService(null);
    setIsCreating(false);
    setError(null);
  };

  if (editingService || isCreating) {
    return (
      <ServiceForm
        service={editingService || { ...defaultService, id: undefined } as Service}
        categories={categories}
        onSave={saveService}
        onCancel={cancelEditing}
        loading={loading}
        error={error}
        isCreating={isCreating}
      />
    );
  }

  return (
    <>
      <OnboardingModal
        isOpen={!!needsOnboarding['services'] && showUserRegModal && !!token}
        title="No Provider Profile Found"
        description="You haven't completed your provider registration yet. Complete your profile to start accepting payments and managing invoices."
        actionLabel="Complete Profile Setup"
        onAction={() => navigate('/edit-profile')}
        secondaryActionLabel="Look Around First"
        onSecondaryAction={() => { 
          setShowUserRegModal(false) 
          completeOnboarding('services')
        }}
        showCloseButton={true}
        onClose={() => { 
          setShowUserRegModal(false) 
          completeOnboarding('services')
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
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-foreground">Services Management</h2>
          <button
            onClick={startCreating}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center"
          >
            <span className="mr-2">+</span>
            Add Service
          </button>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-600 p-3 rounded-lg mb-4">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="text-gray-400">Loading services...</div>
          </div>
        ) : (
          <div className="grid gap-4">
            {services.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No services found. Create your first service to get started.
              </div>
            ) : (
              services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  categories={categories}
                  onEdit={() => startEditing(service)}
                  onDelete={() => service.id && deleteService(service.id)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
};

interface ServiceCardProps {
  service: Service;
  categories: ServiceCategory[];
  onEdit: () => void;
  onDelete: () => void;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ service, categories, onEdit, onDelete }) => {
  const category = categories.find(c => c.id === service.id_service_categories);

  return (
    <div className="bg-card border rounded-lg p-4 shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center mb-2">
            <div 
              className="w-4 h-4 rounded-full mr-3"
              style={{ backgroundColor: service.color }}
            ></div>
            <h3 className="text-lg font-semibold text-foreground">{service.name}</h3>
            {/* {service.is_private && (
              <span className="ml-2 px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                Hidden from Public
              </span>
            )} */}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-300">
            <div className="text-muted-foreground">
              <span >Duration:</span>
              <div>{service.duration} minutes</div>
            </div>
            <div className="text-muted-foreground">
              <span>Price:</span>
              <div>{service.currency} {Number(service.price || 0).toFixed(2)}</div>
            </div>
            <div className="text-muted-foreground">
              <span>Attendants:</span>
              <div>{service.attendants_number}</div>
            </div>
            {/* <div className="text-muted-foreground">
              <span className="text-muted-foreground">Type:</span>
              <div className="capitalize">{service.availabilities_type}</div>
            </div> */}
          </div>

          {category && (
            <div className="mt-2 text-sm text-gray-300">
              <span className="text-gray-400">Category:</span> {category.name}
            </div>
          )}

          {/* {service.location && (
            <div className="mt-2 text-sm text-gray-300">
              <span className="text-gray-400">Location:</span> {service.location}
            </div>
          )} */}

          {service.description && (
            <div className="mt-2 text-sm text-muted-foreground">
              <span>Description:</span> {service.description}
            </div>
          )}
        </div>

        <div className="flex space-x-2 ml-4">
          <button
            onClick={onEdit}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

interface ServiceFormProps {
  service: Service;
  categories: ServiceCategory[];
  onSave: (service: Omit<Service, 'id'> | Service) => void;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
  isCreating: boolean;
}

const ServiceForm: React.FC<ServiceFormProps> = ({
  service,
  onSave,
  onCancel,
  loading,
  error,
  isCreating
}) => {
  const [formData, setFormData] = useState<Service>(service);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' 
        ? parseFloat(value) || 0
        : type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      return;
    }

    onSave(formData);
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-foreground">
            {isCreating ? 'Create Service' : 'Edit Service'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-900 border border-red-600 p-3 rounded-lg mb-4">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Service Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                placeholder="Enter service name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
                Duration (minutes) *
              </label>
              <input
                type="number"
                name="duration"
                value={formData.duration}
                onChange={handleInputChange}
                required
                min="1"
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
                Price
              </label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleInputChange}
                step="0.01"
                min="0"
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
                Currency
              </label>
              <input
                type="text"
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
                maxLength={32}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                placeholder="sats"
              />
            </div>

            {/* <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
                Category
              </label>
              <select
                name="id_service_categories"
                value={formData.id_service_categories || ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              >
                <option value="">No Category</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
                Availabilities Type
              </label>
              <select
                name="availabilities_type"
                value={formData.availabilities_type}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              >
                <option value="flexible">Flexible</option>
                <option value="fixed">Fixed</option>
              </select>
            </div> */}

            <div>
              <label className="block text-sm font-medium text-foreground dark:text-gray-300 mb-2">
                Color
              </label>
              <div className="flex space-x-3">
                {[
                  { value: '#3B82F6', name: 'Blue' },
                  { value: '#10B981', name: 'Green' },
                  { value: '#F59E0B', name: 'Amber' },
                  { value: '#EF4444', name: 'Red' },
                  { value: '#8B5CF6', name: 'Purple' }
                ].map((color) => (
                  <div
                    key={color.value}
                    onClick={() => setFormData(prev => ({ ...prev, color: color.value }))}
                    className={`w-12 h-10 rounded-lg cursor-pointer border-2 transition-all ${
                      formData.color === color.value 
                        ? 'border-gray-900 dark:border-white shadow-lg scale-105' 
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-400'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              placeholder="Enter service description"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_private"
              checked={formData.is_private}
              onChange={handleInputChange}
              className="mr-2 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <label className="text-sm text-gray-900 dark:text-gray-300">
              Hide from public (Private service)
            </label>
          </div>

          <div className="flex justify-end space-x-4 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-foreground px-6 py-2 rounded-lg transition-colors"
            >
              {loading ? 'Saving...' : (isCreating ? 'Create Service' : 'Update Service')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};