import { BookingData, AvailabilityResponse } from '../types/booking'

export class BookingService {
  static async getProviders() {
    const response = await fetch('/api/providers')
    if (!response.ok) {
      throw new Error('Failed to fetch providers')
    }
    return response.json()
  }

  static async getServices() {
    const response = await fetch('/api/services')
    if (!response.ok) {
      throw new Error('Failed to fetch services')
    }
    return response.json()
  }

  static async getProviderAvailability(providerId: number, serviceId: number, date: string): Promise<AvailabilityResponse> {
    const response = await fetch(`/api/providers/${providerId}/availability?serviceId=${serviceId}&date=${date}`)
    if (!response.ok) {
      throw new Error('Failed to fetch availability')
    }
    return response.json()
  }

  static async createAppointment(bookingData: BookingData, signedEvent: any) {
    const response = await fetch('/api/appointments/verify-booking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bookingData,
        signedEvent
      })
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.reason || 'Failed to create appointment')
    }

    return result
  }

  static async getDashboardLoginUrl(token: string) {
    const response = await fetch('/api/appointments/dashboard-login', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()
    if (!response.ok) {
      throw new Error('Failed to get dashboard login URL')
    }

    return result.loginUrl
  }
}