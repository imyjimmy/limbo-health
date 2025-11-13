export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Plebdoc Scheduler Service API',
    version: '1.0.0',
    description: 'Appointments and provider management API built with Bun',
  },
  servers: [
    {
      url: 'http://localhost:3005',
      description: 'Development server'
    },
    {
      url: 'https://api.plebdoc.com',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      Provider: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['provider', 'admin-provider'] }
        }
      },
      Service: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          duration: { type: 'integer' },
          price: { type: 'string' }
        }
      },
      BookingData: {
        type: 'object',
        required: ['providerId', 'serviceId', 'startTime', 'patientInfo'],
        properties: {
          providerId: { type: 'string' },
          serviceId: { type: 'string' },
          startTime: { type: 'string', format: 'date-time' },
          patientInfo: {
            type: 'object',
            properties: {
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              notes: { type: 'string' }
            }
          }
        }
      },
      NostrEvent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          pubkey: { type: 'string' },
          created_at: { type: 'integer' },
          kind: { type: 'integer' },
          tags: { type: 'array' },
          content: { type: 'string' },
          sig: { type: 'string' }
        }
      }
    }
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check endpoint',
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    service: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/admin/providers': {
      get: {
        tags: ['Providers'],
        summary: 'Get all providers',
        description: 'Returns list of all providers (public endpoint)',
        responses: {
          200: {
            description: 'List of providers',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Provider' }
                }
              }
            }
          }
        }
      }
    },
    '/api/admin/providers/{providerId}/services': {
      get: {
        tags: ['Providers'],
        summary: 'Get services for a provider',
        parameters: [
          {
            name: 'providerId',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          200: {
            description: 'List of services',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Service' }
                }
              }
            }
          }
        }
      }
    },
    '/api/providers/{providerId}/availability': {
      get: {
        tags: ['Availability'],
        summary: 'Get provider availability',
        parameters: [
          {
            name: 'providerId',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          },
          {
            name: 'serviceId',
            in: 'query',
            required: true,
            schema: { type: 'string' }
          },
          {
            name: 'date',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'date' }
          },
          {
            name: 'timezone',
            in: 'query',
            schema: { type: 'string' }
          },
          {
            name: 'currentTime',
            in: 'query',
            schema: { type: 'string' }
          }
        ],
        responses: {
          200: {
            description: 'Available time slots',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    providerId: { type: 'string' },
                    serviceId: { type: 'string' },
                    providerName: { type: 'string' },
                    serviceName: { type: 'string' },
                    serviceDuration: { type: 'integer' },
                    availableHours: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/appointments/verify-booking': {
      post: {
        tags: ['Appointments'],
        summary: 'Create appointment with Nostr signature',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  bookingData: { $ref: '#/components/schemas/BookingData' },
                  signedEvent: { $ref: '#/components/schemas/NostrEvent' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Appointment created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    appointmentId: { type: 'integer' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          400: {
            description: 'Invalid signature or booking data'
          }
        }
      }
    },
    '/api/appointments/dashboard-login': {
      post: {
        tags: ['Authentication'],
        summary: 'Generate dashboard login URL',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Login URL generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    loginUrl: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/appointments/validate-login-token': {
      post: {
        tags: ['Authentication'],
        summary: 'Validate one-time login token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  token: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Token validated successfully'
          },
          401: {
            description: 'Invalid or expired token'
          }
        }
      }
    }
  }
};