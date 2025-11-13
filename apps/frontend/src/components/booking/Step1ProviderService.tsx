import { useState, useEffect } from 'react';
import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions, Label } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { BookingData } from './BookingWorkflow';

interface Step1Props {
  data: BookingData;
  onNext: () => void;
  onUpdate: (updates: Partial<BookingData>) => void;
  providerId?: string;
}

interface Provider {
  id: string;
  name: string;
  email: string;
}

interface Service {
  id: string;
  name: string;
  duration: number;
  price: string;
}

export function Step1ProviderService({ data, onNext, onUpdate, providerId }: Step1Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    data.provider ? { ...data.provider, email: data.provider.email || '' } : null
  );
  const [selectedService, setSelectedService] = useState<Service | null>(
    data.service ? { ...data.service, price: data.service.price || '' } : null
  );
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [providerQuery, setProviderQuery] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');

  useEffect(() => {
    loadProviders();
  }, []);

  // Auto-select provider when providerId is provided and providers are loaded
  useEffect(() => {
    if (providerId && providers.length > 0 && !selectedProvider) {
      console.log("here!!!!", providers, providerId);
      const matchingProvider = providers.find(p => { console.log(p.id, typeof p.id, providerId, typeof providerId); return  p.id === providerId } );
      console.log('matching provider: ', matchingProvider);
      if (matchingProvider) {
        console.log('🎯 Auto-selecting provider:', matchingProvider);
        setSelectedProvider(matchingProvider);
        onUpdate({ provider: matchingProvider });
      }
    }
  }, [providers]);

  useEffect(() => {
    if (selectedProvider) {
      loadServicesForProvider(selectedProvider.id);
    } else {
      setServices([]);
      setSelectedService(null);
      onUpdate({ service: null });
    }
  }, [selectedProvider]);

  const loadProviders = async () => {
    console.log('🔍 Starting loadProviders function...');

    try {
      console.log('🌐 About to fetch /api/admin/providers');
      const response = await fetch('/api/admin/providers');
      console.log('📡 Fetch completed, response:', response);
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);

      if (response.ok) {
        const providersData = await response.json();
        console.log('📊 Providers data received:', providersData);
        setProviders(providersData);
      }
    } catch (error) {
      console.error('Error loading providers:', error);
    } finally {
      setLoadingProviders(false);
    }
  };

  const loadServicesForProvider = async (providerId: string) => {
    console.log('🔍 loadServicesForProvider called with providerId:', providerId);
    setLoadingServices(true);
    
    try {
      const url = `/api/admin/providers/${providerId}/services`;
      console.log('🌐 About to fetch:', url);
      
      const response = await fetch(url);
      console.log('📡 Services fetch response:', response);
      console.log('📡 Services response status:', response.status);
      console.log('📡 Services response ok:', response.ok);

      if (response.ok) {
        const servicesData = await response.json();
        console.log('📊 Services data received:', servicesData);
        setServices(servicesData);
      } else {
        console.error('❌ Services fetch failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
      }
    } catch (error) {
      console.error('❌ Error loading services:', error);
    } finally {
      setLoadingServices(false);
    }
  };

  const handleProviderChange = (provider: Provider | null) => {
    setSelectedProvider(provider);
    setSelectedService(null); // Reset service when provider changes
    onUpdate({ provider, service: null });
  };

  const handleServiceChange = (service: Service | null) => {
    setSelectedService(service);
    onUpdate({ service });
  };

  const filteredProviders =
    providerQuery === ''
      ? providers
      : providers.filter((provider) => {
          return provider.name.toLowerCase().includes(providerQuery.toLowerCase());
        });

  const filteredServices =
    serviceQuery === ''
      ? services
      : services.filter((service) => {
          return service.name.toLowerCase().includes(serviceQuery.toLowerCase());
        });

  const canContinue = selectedProvider && selectedService;

  const handleNext = () => {
    if (canContinue) {
      onNext();
    }
  };

  if (loadingProviders) {
    return (
      <div className="animate-pulse">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Select Provider & Service</h2>
        <div className="space-y-6">
          <div className="h-16 bg-gray-300 dark:bg-gray-600 rounded"></div>
          <div className="h-16 bg-gray-300 dark:bg-gray-600 rounded"></div>
        </div>
      </div>
    );
  }

  // Disable provider selection if providerId is provided
  const isProviderLocked = !!providerId;

  return (
    <div className="mx-auto w-5/6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Select Provider & Service</h2>
      
      <div className="space-y-6">
        {/* Provider Combobox */}
        <Combobox
          as="div"
          value={selectedProvider}
          onChange={(provider) => {
            setProviderQuery('');
            handleProviderChange(provider);
          }}
          disabled={isProviderLocked}
        >
          <Label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
            Provider
          </Label>
          <div className="relative mt-2">
            <ComboboxInput
              className="block w-full rounded-md bg-white py-1.5 pl-3 pr-12 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-gray-700 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              onChange={(event) => setProviderQuery(event.target.value)}
              onBlur={() => setProviderQuery('')}
              displayValue={(provider: Provider | null) => provider?.name || ''}
              placeholder="Please Select a Provider"
              disabled={isProviderLocked}
            />
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
              <ChevronDownIcon className="size-5 text-gray-400" aria-hidden="true" />
            </ComboboxButton>

            {!isProviderLocked && (
              <ComboboxOptions
                transition
                className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-1 outline-black/5 data-[closed]:data-[leave]:opacity-0 data-[leave]:transition data-[leave]:duration-100 data-[leave]:ease-in sm:text-sm dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10"
              >
                {filteredProviders.map((provider) => (
                  <ComboboxOption
                    key={provider.id}
                    value={provider}
                    className="cursor-default select-none px-3 py-2 text-gray-900 data-[focus]:bg-indigo-600 data-[focus]:text-white data-[focus]:outline-none dark:text-gray-300 dark:data-[focus]:bg-indigo-500"
                  >
                    <span className="block truncate">{provider.name}</span>
                  </ComboboxOption>
                ))}
              </ComboboxOptions>
            )}
          </div>
        </Combobox>

        {/* Service Combobox - Only show when provider is selected */}
        {selectedProvider && (
          <Combobox
            as="div"
            value={selectedService}
            onChange={(service) => {
              setServiceQuery('');
              handleServiceChange(service);
            }}
          >
            <Label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
              Service
            </Label>
            <div className="relative mt-2">
              <ComboboxInput
                className="block w-full rounded-md bg-white py-1.5 pl-3 pr-12 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-gray-700 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                onChange={(event) => setServiceQuery(event.target.value)}
                onBlur={() => setServiceQuery('')}
                displayValue={(service: Service | null) => service?.name || ''}
                placeholder={loadingServices ? "Loading services..." : "Please Select a Service"}
                disabled={loadingServices}
              />
              <ComboboxButton className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                {loadingServices ? (
                  <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-indigo-600 rounded-full"></div>
                ) : (
                  <ChevronDownIcon className="size-5 text-gray-400" aria-hidden="true" />
                )}
              </ComboboxButton>

              {!loadingServices && (
                <ComboboxOptions
                  transition
                  className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-1 outline-black/5 data-[closed]:data-[leave]:opacity-0 data-[leave]:transition data-[leave]:duration-100 data-[leave]:ease-in sm:text-sm dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10"
                >
                  {filteredServices.length === 0 ? (
                    <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
                      No services available for this provider
                    </div>
                  ) : (
                    filteredServices.map((service) => (
                      <ComboboxOption
                        key={service.id}
                        value={service}
                        className="cursor-default select-none px-3 py-2 text-gray-900 data-[focus]:bg-indigo-600 data-[focus]:text-white data-[focus]:outline-none dark:text-gray-300 dark:data-[focus]:bg-indigo-500"
                      >
                        <span className="block truncate">
                          {service.name} ({service.duration} min)
                        </span>
                      </ComboboxOption>
                    ))
                  )}
                </ComboboxOptions>
              )}
            </div>
          </Combobox>
        )}

        {selectedProvider && selectedService && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Selected:</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Provider: {selectedProvider.name}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Service: {selectedService.name} ({selectedService.duration} minutes)
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleNext}
          disabled={!canContinue}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Next: Select Time
        </button>
      </div>
    </div>
  );
}