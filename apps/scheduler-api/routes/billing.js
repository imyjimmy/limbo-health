import { NostrWebLNProvider } from "@getalby/sdk";
import { finalizeEvent } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { nip04, nip19 } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';

import { pool } from '../config/database.js';
import { validateAuthToken } from '../middleware/auth.js';

// Helper function for sending payment requests via Nostr DM (copied from admin-routes.js)
async function sendInvoiceDM(patientPubkey, invoiceData) {
  try {
    // Check if admin has Nostr keys configured
    const adminPrivateKeyInput = process.env.ADMIN_NOSTR_PRIVATE_KEY;
    if (!adminPrivateKeyInput) {
      console.log('ADMIN_NOSTR_PRIVATE_KEY not configured, cannot send DMs');
      throw new Error('ADMIN_NOSTR_PRIVATE_KEY not configured');
    }

    // Convert hex string to Uint8Array (32 bytes)
    let adminPrivateKey;
  
    // Handle both nsec and hex formats
    if (adminPrivateKeyInput.startsWith('nsec')) {
      // Convert nsec to hex then to bytes
      const { data: hexKey } = nip19.decode(adminPrivateKeyInput);
      console.log('hexKey: ', hexKey);
      adminPrivateKey = hexKey;
    } else {
      // Pad hex to 64 characters if needed (add leading zero)
      const paddedHex = adminPrivateKeyInput.padStart(64, '0');
      adminPrivateKey = hexToBytes(paddedHex);
    }

    console.log('Sending invoice DM, payment request:', invoiceData.payment_request.substring(0, 20) + '...');
    
    // Create invoice DM content
    const dmContent = JSON.stringify({
      type: 'lightning_invoice',
      version: '1.0',
      invoice: {
        payment_request: invoiceData.payment_request,
        amount_sats: invoiceData.amount_sats,
        service: invoiceData.service_name,
        appointment_date: invoiceData.start_datetime,
        status: invoiceData.status
      },
      message: `Invoice for your ${invoiceData.service_name} appointment\n\nAmount: ${invoiceData.amount_sats} sats\nPayment Request: ${invoiceData.payment_request}\n\nPlease pay this invoice to complete your appointment payment.`
    });

    // Encrypt the DM content
    const encryptedContent = await nip04.encrypt(adminPrivateKey, patientPubkey, dmContent);

    // Create and finalize the DM event (v2+ syntax)
    const eventTemplate = {
      kind: 4, // Encrypted Direct Message
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', patientPubkey]],
      content: encryptedContent
    };

    // finalizeEvent calculates pubkey, id, and signature in one step
    const signedEvent = finalizeEvent(eventTemplate, adminPrivateKey);

    // Send to Nostr relays
    const pool = new SimplePool();
    const relays = [
      'wss://relay.damus.io',
      'wss://nos.lol', 
      'wss://relay.snort.social'
    ];

    console.log(`Sending invoice DM to patient ${patientPubkey.substring(0, 8)}...`);
    
    // Use Promise.any instead of Promise.allSettled for better error handling
    await Promise.any(pool.publish(relays, signedEvent));
    
    console.log('Invoice DM sent successfully');
    pool.close(relays);

  } catch (error) {
    console.error('Failed to send payment request DM:', error);
    throw error;
  }
}

class BillingService {
  constructor(nwcConnectionString) {
    if (!nwcConnectionString) {
      throw new Error('NWC_CONNECTION_STRING is required');
    }
    
    console.log('Billing Service creation: ', nwcConnectionString);
    this.provider = null;
    this.connected = false;
    this.nwcUrl = nwcConnectionString;
    this.pendingInvoices = new Map();
    this.invoiceHistory = new Map();
  }

  async connect() {
    try {
      this.provider = new NostrWebLNProvider({
        nostrWalletConnectUrl: this.nwcUrl,
      });
      
      await this.provider.enable();
      this.connected = true;
      console.log('💰 Billing service connected via NWC');
      return true;
    } catch (error) {
      console.error('❌ Billing service connection failed:', error);
      this.connected = false;
      throw error;
    }
  }

  // Create invoice for appointment payment
  async createAppointmentInvoice(appointmentId, amountSats, description, expiry = 3600) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      console.log(`💸 Creating appointment invoice: ${amountSats} sats for appointment ${appointmentId}, expires in ${expiry}s`);
      
      // Validation
      if (!amountSats || amountSats <= 0) {
        throw new Error(`Invalid amount: ${amountSats}`);
      }
      
      if (!expiry || expiry <= 0) {
        throw new Error(`Invalid expiry: ${expiry}`);
      }

      const invoice = await this.provider.makeInvoice({
        amount: parseInt(amountSats),
        defaultMemo: `PlebDoc Appointment: ${description} - Appointment ID: ${appointmentId}`,
        expiry: parseInt(expiry)
      });

      console.log('Created appointment invoice: ', invoice);
      
      const invoiceData = {
        appointmentId,
        amountSats: parseInt(amountSats),
        description,
        expiry: parseInt(expiry),
        expiresAt: Date.now() + (expiry * 1000),
        createdAt: Date.now(),
        type: 'appointment',
        status: 'pending'
      };

      this.pendingInvoices.set(invoice.paymentRequest, invoiceData);

      return {
        paymentRequest: invoice.paymentRequest,
        appointmentId,
        amountSats: parseInt(amountSats),
        description,
        expiresAt: Date.now() + (expiry * 1000),
        status: 'pending'
      };

    } catch (error) {
      console.error(`💥 Appointment invoice creation failed:`, error);
      // return this.createMockInvoice(appointmentId, amountSats, 'appointment', expiry, description);
    }
  }

  // Create invoice for service fees (consultation, follow-ups, etc.)
  async createServiceInvoice(serviceId, patientId, amountSats, description, expiry = 3600) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      console.log(`💸 Creating service invoice: ${amountSats} sats for service ${serviceId}, expires in ${expiry}s`);
      
      if (!amountSats || amountSats <= 0) {
        throw new Error(`Invalid amount: ${amountSats}`);
      }

      const invoice = await this.provider.makeInvoice({
        amount: parseInt(amountSats),
        defaultMemo: `PlebDoc Service: ${description} - Service ID: ${serviceId}`,
        expiry: parseInt(expiry)
      });

      const invoiceData = {
        serviceId,
        patientId,
        amountSats: parseInt(amountSats),
        description,
        expiry: parseInt(expiry),
        expiresAt: Date.now() + (expiry * 1000),
        createdAt: Date.now(),
        type: 'service',
        status: 'pending'
      };

      this.pendingInvoices.set(invoice.paymentRequest, invoiceData);

      return {
        paymentRequest: invoice.paymentRequest,
        serviceId,
        patientId,
        amountSats: parseInt(amountSats),
        description,
        expiresAt: Date.now() + (expiry * 1000),
        status: 'pending'
      };

    } catch (error) {
      console.error(`💥 Service invoice creation failed:`, error);
      // return this.createMockInvoice(serviceId, amountSats, 'service', expiry, description);
    }
  }

  // Mock invoice for testing
  // createMockInvoice(entityId, amountSats, type, expiry, description) {
  //   console.log(`🧪 Creating mock ${type} invoice: ${amountSats} sats, expires in ${expiry}s`);
    
  //   const mockInvoice = `lnbc${amountSats}n1test_${type}_${entityId}_${Date.now()}`;
    
  //   const invoiceData = {
  //     entityId,
  //     amountSats,
  //     type,
  //     description,
  //     expiry,
  //     expiresAt: Date.now() + (expiry * 1000),
  //     createdAt: Date.now(),
  //     mock: true,
  //     status: 'pending'
  //   };

  //   this.pendingInvoices.set(mockInvoice, invoiceData);

  //   return {
  //     paymentRequest: mockInvoice,
  //     paymentHash: 'mock_hash_' + Math.random().toString(36).substr(2, 8),
  //     entityId,
  //     amountSats,
  //     expiresAt: Date.now() + (expiry * 1000),
  //     status: 'pending'
  //   };
  // }

  // Check if an invoice has been paid
  async checkInvoicePayment(paymentRequest) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      // Check if this is a mock invoice
      const invoiceData = this.pendingInvoices.get(paymentRequest);

      if (invoiceData && invoiceData.mock) {
        console.log(`🧪 Mock invoice check for ${paymentRequest.substring(0, 20)}...`);
        // For testing, randomly return paid status after some time
        const elapsed = Date.now() - invoiceData.createdAt;
        const isPaid = elapsed > 30000; // Mock payment after 30 seconds
        
        if (isPaid) {
          invoiceData.status = 'paid';
          this.invoiceHistory.set(paymentRequest, invoiceData);
          this.pendingInvoices.delete(paymentRequest);
        }
        
        return {
          paid: isPaid,
          amount: invoiceData.amountSats,
          paymentRequest: paymentRequest,
          settledAt: isPaid ? Date.now() : null,
          status: invoiceData.status
        };
      }

      // For real invoices, use the provider to check payment status
      const invoice = await this.provider.lookupInvoice({
        paymentRequest
      });

      const isPaid = invoice.settled || invoice.state === 'SETTLED';
      
      if (isPaid && invoiceData) {
        invoiceData.status = 'paid';
        this.invoiceHistory.set(paymentRequest, invoiceData);
        this.pendingInvoices.delete(paymentRequest);
      }

      return {
        paid: isPaid,
        amount: invoice.value || invoiceData?.amountSats || 0,
        paymentRequest: paymentRequest,
        settledAt: invoice.settle_date || (isPaid ? Date.now() : null),
        status: isPaid ? 'paid' : 'pending'
      };

    } catch (error) {
      console.error(`Failed to check invoice payment for ${paymentRequest.substring(0, 20)}...:`, error);
      
      return {
        paid: false,
        amount: 0,
        paymentRequest: paymentRequest,
        status: 'error',
        error: error.message
      };
    }
  }

  // Check if invoice is expired
  isInvoiceExpired(paymentRequest) {
    const invoiceData = this.pendingInvoices.get(paymentRequest);
    
    if (!invoiceData) return true;
    
    return Date.now() > invoiceData.expiresAt;
  }

  // Get all pending invoices
  getPendingInvoices() {
    return Array.from(this.pendingInvoices.entries()).map(([paymentRequest, data]) => ({
      paymentRequest,
      ...data,
      expired: this.isInvoiceExpired(paymentRequest)
    }));
  }

  // Get invoice history
  getInvoiceHistory() {
    return Array.from(this.invoiceHistory.entries()).map(([paymentRequest, data]) => ({
      paymentRequest,
      ...data
    }));
  }

  // Cancel expired invoices
  cleanupExpiredInvoices() {
    const now = Date.now();
    const expired = [];
    
    for (const [paymentRequest, data] of this.pendingInvoices.entries()) {
      if (now > data.expiresAt) {
        expired.push(paymentRequest);
        this.pendingInvoices.delete(paymentRequest);
        console.log(`🗑️ Cleaned up expired invoice: ${paymentRequest.substring(0, 20)}...`);
      }
    }
    
    return expired;
  }
}

// Initialize billing service instance
const billingService = new BillingService(process.env.NWC_CONNECTION_STRING || 'mock');

export const setupBillingRoutes = (app) => {
  
  // Get billing statistics - uses existing invoices table
  app.get('/api/admin/billing/stats', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (authResult && !authResult.success) {
      return authResult; // This will be the error response
    }

    let connection;
    try {
      connection = await pool.getConnection();

      const [invoiceStats] = await connection.execute(`
        SELECT 
          COUNT(*) as total_invoices,
          SUM(CASE WHEN status = 'paid' THEN amount_sats ELSE 0 END) as total_revenue_sats,
          SUM(CASE WHEN status = 'pending' THEN amount_sats ELSE 0 END) as pending_revenue_sats,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_invoices,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_invoices
        FROM invoices 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `);

      const [appointmentCount] = await connection.execute(`
        SELECT COUNT(*) as total_appointments 
        FROM appointments 
        WHERE start_datetime >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `);

      return res.json({
        status: 'success',
        stats: {
          total_appointments: appointmentCount[0].total_appointments,
          pending_invoices: invoiceStats[0].pending_invoices,
          paid_invoices: invoiceStats[0].paid_invoices,
          total_revenue_sats: invoiceStats[0].total_revenue_sats
        }
      });

    } catch (error) {
      console.error('Error fetching billing statistics:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch billing statistics'
      });
    } finally {
      if (connection) connection.release();
    }
  });

  // Get invoice details for an appointment
  app.get('/api/admin/billing/appointments/:appointmentId/invoice', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (authResult && !authResult.success) {
      return authResult;
    }

    let connection;
    try {
      const { appointmentId } = req.params;
      
      connection = await pool.getConnection();
      
      const [invoiceRows] = await connection.execute(`
        SELECT 
          i.*,
          a.start_datetime,
          a.end_datetime,
          CONCAT(uc.first_name, ' ', uc.last_name) as customer_name,
          uc.email as customer_email,
          s.name as service_name,
          s.price as service_price,
          s.duration as service_duration
        FROM invoices i
        JOIN appointments a ON i.appointment_id = a.id
        JOIN users uc ON a.id_users_customer = uc.id
        JOIN services s ON a.id_services = s.id
        WHERE i.appointment_id = ?
      `, [appointmentId]);
      
      if (invoiceRows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Invoice not found for this appointment'
        });
      }
      
      const invoice = invoiceRows[0];
      
      return res.json({
        status: 'success',
        invoice: {
          id: invoice.id,
          appointment_id: invoice.appointment_id,
          amount_sats: invoice.amount_sats,
          payment_request: invoice.payment_request,
          invoice_hash: invoice.invoice_hash,
          status: invoice.status,
          created_at: invoice.created_at,
          paid_at: invoice.paid_at,
          appointment: {
            start_datetime: invoice.start_datetime,
            end_datetime: invoice.end_datetime,
            customer_name: invoice.customer_name,
            customer_email: invoice.customer_email,
            service_name: invoice.service_name,
            service_price: invoice.service_price,
            service_duration: invoice.service_duration
          }
        }
      });
      
    } catch (error) {
      console.error('Failed to fetch invoice:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch invoice details',
        error: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  });

  // Create invoice for appointment
  app.post('/api/admin/billing/appointments/:appointmentId/invoice', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (authResult && !authResult.success) {
      return authResult;
    }

    let connection;
    try {
      const { appointmentId } = req.params;
      const { amountSats, description } = req.body;

      connection = await pool.getConnection();

      // Check if invoice already exists
      const [existing] = await connection.execute(
        'SELECT id FROM invoices WHERE appointment_id = ?',
        [appointmentId]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Invoice already exists for this appointment'
        });
      }

      // Create real Lightning invoice using billingService
      const invoice = await billingService.createAppointmentInvoice(
        appointmentId, 
        amountSats, 
        description || `Appointment #${appointmentId}`,
        3600 // 1 hour expiry
      );

      if (!invoice || !invoice.paymentRequest) {
        throw new Error('Failed to create Lightning invoice');
      }

      // Extract invoice hash from payment request (you might need to adjust this based on your Lightning implementation)
      const invoiceHash = invoice.paymentHash || 'hash_' + Math.random().toString(36).substr(2, 8);

      // Insert invoice into database
      const [result] = await connection.execute(`
        INSERT INTO invoices (appointment_id, payment_request, amount_sats, invoice_hash, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', NOW())
      `, [appointmentId, invoice.paymentRequest, amountSats, invoiceHash]);

      return res.json({
        status: 'success',
        invoice: {
          id: result.insertId,
          appointmentId,
          paymentRequest: invoice.paymentRequest,
          amount: amountSats,
          status: 'pending'
        }
      });

    } catch (error) {
      console.error('Error creating invoice:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to create invoice',
        details: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  });

  //DM nostr user with invoice
  app.post('/api/admin/billing/appointments/:appointmentId/send-dm', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (authResult && !authResult.success) {
      return authResult;
    }

    let connection;
    try {
      const { appointmentId } = req.params;
      
      connection = await pool.getConnection();
      
      // Get appointment and invoice details
      const [rows] = await connection.execute(`
        SELECT 
          i.payment_request,
          i.amount_sats,
          i.status,
          a.start_datetime,
          CONCAT(uc.first_name, ' ', uc.last_name) as customer_name,
          uc.email as customer_email,
          uc.nostr_pubkey,
          s.name as service_name
        FROM invoices i
        JOIN appointments a ON i.appointment_id = a.id
        JOIN users uc ON a.id_users_customer = uc.id
        JOIN services s ON a.id_services = s.id
        WHERE i.appointment_id = ?
      `, [appointmentId]);
      
      console.log('rows:', rows);
      if (rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Invoice not found for this appointment'
        });
      }
      
      const invoice = rows[0];
      console.log('invoice:', invoice)

      if (!invoice.nostr_pubkey) {
        return res.status(400).json({
          status: 'error',
          message: 'Patient does not have a Nostr pubkey registered'
        });
      }

      // Create DM content
      const dmContent = {
        type: 'lightning_invoice',
        version: '1.0',
        invoice: {
          payment_request: invoice.payment_request,
          amount_sats: invoice.amount_sats,
          service: invoice.service_name,
          appointment_date: invoice.start_datetime,
          status: invoice.status
        },
        message: `Invoice for your ${invoice.service_name} appointment\n\nAmount: ${invoice.amount_sats} sats\nPayment Request: ${invoice.payment_request}\n\nPlease pay this invoice to complete your appointment payment.`
      };

      console.log('Would send DM to:', invoice.nostr_pubkey);
      console.log('DM Content:', dmContent);
      
      // sends invoice via NOSTR DMs
      try {
        await sendInvoiceDM(invoice.nostr_pubkey, {
          payment_request: invoice.payment_request,
          amount_sats: invoice.amount_sats,
          service_name: invoice.service_name,
          start_datetime: invoice.start_datetime,
          status: invoice.status
        });
      } catch (dmError) {
        console.error('Failed to send DM:', dmError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to send DM: ' + dmError.message
        });
      }
      
      return res.json({
        status: 'success',
        message: `Invoice DM sent to ${invoice.customer_name}`
      });
      
    } catch (error) {
      console.error('Failed to send invoice DM:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to send invoice DM',
        error: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  });
};

// Export the billing service instance for use in other modules
export { billingService };