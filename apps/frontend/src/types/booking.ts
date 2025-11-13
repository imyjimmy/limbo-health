export interface Provider {
  id: number
  first_name: string
  last_name: string
  email: string
  phone_number: string
}

export interface Service {
  id: number
  name: string
  duration: number
  description?: string
  price?: number
}

export interface BookingData {
  providerId: number
  serviceId: number
  startTime: string
  adminInfo: {
    firstName: string
    lastName: string
    email: string
    phone: string
    notes?: string
  }
}

export interface AvailabilityResponse {
  date: string
  providerId: number
  serviceId: number
  providerName: string
  serviceName: string
  serviceDuration: number
  availableHours: string[]
}