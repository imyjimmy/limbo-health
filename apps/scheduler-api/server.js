import { setupProviderRoutes } from './routes/providers.js';
import { setupAppointmentRoutes } from './routes/appointments.js';
import { setupAdminRoutes } from './routes/admin.js';
import { setupWebRTCRoutes } from './routes/webrtc.js';
import { setupBillingRoutes } from './routes/billing.js';
import { setupGoogleRoutes } from './routes/google-auth.js';
import { setupUserKeysRoutes } from './routes/user-keys.js';

import { swaggerSpec } from './docs/swagger.js';

const PORT = process.env.PORT || 3005;

// Route registry - collect all routes here
const routes = {
  GET: new Map(),
  POST: new Map(),
  PUT: new Map(),
  DELETE: new Map()
};

// Create app-like object that STORES routes
const app = {
  get: (path, handler) => routes.GET.set(path, handler),
  post: (path, handler) => routes.POST.set(path, handler),
  put: (path, handler) => routes.PUT.set(path, handler),
  delete: (path, handler) => routes.DELETE.set(path, handler)
};

// Register all routes ONCE at startup
console.log('🔧 Setting up provider routes...');
setupProviderRoutes(app);
console.log('🔧 Setting up appointment routes...');
setupAppointmentRoutes(app);
console.log('🔧 Setting up admin routes...');
setupAdminRoutes(app);
console.log('🔧 Setting up Webrtc Routes');
setupWebRTCRoutes(app);
console.log('Setting up Google Routes');
setupGoogleRoutes(app);
console.log('🔧 Setting up Billing Routes');
setupBillingRoutes(app);
console.log('🔧 Setting up User Key Routes');
setupUserKeysRoutes(app);

console.log(`📋 Registered routes:`, {
  GET: Array.from(routes.GET.keys()),
  POST: Array.from(routes.POST.keys()),
  PUT: Array.from(routes.PUT.keys()),
  DELETE: Array.from(routes.DELETE.keys())
});

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255, // 255 seconds, about 4 minutes
  async fetch(req) {
    const url = new URL(req.url);
    
    console.log('🔍 Request:', req.method, url.pathname);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' chrome-extension: moz-extension:; connect-src 'self' wss: https: chrome-extension: moz-extension: http://localhost:3005; img-src 'self' data: https: chrome-extension: moz-extension:; style-src 'self' 'unsafe-inline' chrome-extension: moz-extension:; font-src 'self' data: chrome-extension: moz-extension:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';"
    };

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'OK', service: 'plebdoc-appointments-service' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Serve Swagger JSON spec
    if (url.pathname === '/api-docs.json') {
      return new Response(JSON.stringify(swaggerSpec), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Serve static files from uploads directory
    if (url.pathname.startsWith('/uploads/')) {
      console.log('📁 Static file request:', url.pathname);
      console.log('📁 Current working directory:', process.cwd());
      try {
        const filepath = `.${url.pathname}`;
        console.log('📁 Filepath:', filepath);
        console.log('📁 Resolved path:', require('path').resolve(filepath));
        const file = Bun.file(filepath);
        const exists = await file.exists();
        console.log('📁 File exists:', exists);
        
        if (!exists) {
          return new Response('File not found', { 
            status: 404,
            headers: corsHeaders 
          });
        }
        
        // Get file extension to set correct content type
        const ext = filepath.split('.').pop().toLowerCase();
        const contentTypes = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'webp': 'image/webp',
          'gif': 'image/gif'
        };
        
        return new Response(file, {
          headers: {
            'Content-Type': contentTypes[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000',
            ...corsHeaders
          }
        });
      } catch (error) {
        console.error('Error serving static file:', error);
        return new Response('Internal server error', { 
          status: 500,
          headers: corsHeaders 
        });
      }
    }

    // Find matching route
    const methodRoutes = routes[req.method];
    if (methodRoutes) {
      for (const [pattern, handler] of methodRoutes) {
        if (matchPath(url.pathname, pattern)) {
          console.log('✅ Found matching route:', pattern);
          const reqObj = await createReq(req, url, pattern);
          const resObj = createRes(corsHeaders);
          // console.log('resObj: ', resObj);
          return await handler(reqObj, resObj);
        }
      }
    }
    
    console.log('❌ No route matched for:', req.method, url.pathname);
    // If no route matched, return 404
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

console.log(`🚀 Plebdoc Appointments Service running on port ${PORT}`);

// Helper functions (same as before)
function matchPath(pathname, pattern) {
  if (pattern.includes(':')) {
    const patternParts = pattern.split('/');
    const pathnameParts = pathname.split('/');
    
    if (patternParts.length !== pathnameParts.length) return false;
    
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) continue;
      if (patternParts[i] !== pathnameParts[i]) return false;
    }
    return true;
  }
  return pathname === pattern;
}

async function createReq(req, url, pattern) {
  // console.log('createReq called with:');
  // console.log('  - method:', req.method);
  // console.log('  - url.pathname:', url.pathname);
  // console.log('  - pattern:', pattern);
  // console.log('  - req.headers type:', typeof req.headers);
  // console.log('  - req.headers has entries method:', typeof req.headers?.entries);

  const params = {};
  
  if (pattern.includes(':')) {
    const patternParts = pattern.split('/');
    const pathnameParts = url.pathname.split('/');
    
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        const paramName = patternParts[i].substring(1);
        params[paramName] = pathnameParts[i];
      }
    }
    console.log('  - extracted params:', params);
  }

  // Parse body for POST/PUT requests
  let body = null;
  const contentType = req.headers.get('content-type');
  console.log('  - content-type:', contentType);
  
  if (['POST', 'PUT'].includes(req.method) && contentType?.includes('application/json')) {
    const contentLength = req.headers.get('content-length');
    console.log('  - content-length:', contentLength);
  
    if (contentLength && parseInt(contentLength) > 0) {
      console.log('  - parsing JSON body:', req);
      body = await req.json();
      console.log('  - parsed body:', body);
    } else {
      console.log('  - empty body, skipping JSON parse');
      body = {}
    }
  }

  const headerEntries = Array.from(req.headers.entries());
  console.log('  - header entries sample:', headerEntries.slice(0, 3));
  
  const headersObj = Object.fromEntries(headerEntries);
  console.log('  - converted headers keys:', Object.keys(headersObj));

  const reqObj = {
    params,
    query: Object.fromEntries(url.searchParams),
    headers: headersObj,
    body: body,
    json: () => Promise.resolve(body),
    formData: () => req.formData(),
  };
  
  // console.log('createReq returning object with headers:', Object.keys(reqObj.headers));
  return reqObj;
}

function createRes(corsHeaders) {
  return {
    json: (data) => {
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    },
    status: (code) => ({
      json: (data) => {
        return new Response(JSON.stringify(data), {
          status: code,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    })
  };
}