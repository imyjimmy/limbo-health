require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const https = require('https');
const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util'); // Add this line
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const authApiClient = require('./authApiClient');
const { authMiddleware, jwtOnly } = require('./authMiddleware');

console.log('=== MGit Server Starting - Build Version 2025-06-08-v2 ===');

// nostr
const { verifyEvent, validateEvent } = require('nostr-tools');

// Import security configuration
const configureSecurity = require('./security');

const mgitUtils = require('./mgitUtils');
const utils = require('./utils');

const execAsync = promisify(exec);

const app = express();
app.use(express.json());
app.use(cors());

// Add CSP headers to allow Nostr extension functionality
app.use((req, res, next) => {
  const cspPolicy = 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' chrome-extension: moz-extension:; " +
    "connect-src 'self' wss: https: chrome-extension: moz-extension:; " +
    "img-src 'self' data: https: chrome-extension: moz-extension: https://blossom.primal.net; " +
    "style-src 'self' 'unsafe-inline' chrome-extension: moz-extension:; " +
    "font-src 'self' data: chrome-extension: moz-extension:; " +
    "object-src 'none';";
  
  // console.log('=== CSP DEBUG ===');
  // console.log('Request URL:', req.url);
  // console.log('Setting CSP:', cspPolicy);
  
  res.setHeader('Content-Security-Policy', cspPolicy);
  
  // console.log('CSP Header set:', res.getHeader('Content-Security-Policy'));
  // console.log('=================');
  next();
});

// Apply security configurations
const security = configureSecurity(app);

// Trust proxy for Cloudflare Tunnel
app.set('trust proxy', true);

// JWT secret key for authentication tokens
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// Token expiration time in seconds (2 hrs)
const TOKEN_EXPIRATION = 120 * 60;

// Store pending challenges in memory (use a database in production)
const pendingChallenges = new Map();

// Path to repositories storage - secure path verified by security module
const REPOS_PATH = security.ensureSecurePath();
const GIT_PATH = 'git';

// Get base URL from environment or construct from request
const getBaseUrl = (req) => {
  // Priority 1: Environment variable
  if (process.env.MGIT_SERVER_URL) {
    return process.env.MGIT_SERVER_URL;
  }
  
  // Priority 2: Construct from request headers (works with reverse proxies)
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3003';
  return `${protocol}://${host}`;
};

async function initializeServer() {
  try {
    if (!fs.existsSync(REPOS_PATH)) {
      console.log(`📁 Creating repositories directory: ${REPOS_PATH}`);
      fs.mkdirSync(REPOS_PATH, { recursive: true });
    }
    console.log(`✅ Repositories directory: ${REPOS_PATH}`);
  } catch (error) {
    console.error('❌ Failed to initialize server:', error);
    throw error;
  }
}

// async function scanAndRepairRepositories() {
//   try {
//     // Check if repos directory exists
//     console.log(`🔍 Checking REPOS_PATH: ${REPOS_PATH}`);
//     console.log(`🔍 REPOS_PATH exists: ${fs.existsSync(REPOS_PATH)}`);
    
//     if (!fs.existsSync(REPOS_PATH)) {
//       console.log(`📁 Creating repositories directory: ${REPOS_PATH}`);
//       fs.mkdirSync(REPOS_PATH, { recursive: true });
//       return;
//     }

//     // Get all directories in REPOS_PATH (these are potential repositories)
//     const entries = fs.readdirSync(REPOS_PATH, { withFileTypes: true });
//     console.log(`📁 Found ${entries.length} entries in ${REPOS_PATH}:`, entries.map(e => `${e.name} (${e.isDirectory() ? 'dir' : 'file'})`));
    
//     const repoDirs = entries
//       .filter(entry => entry.isDirectory())
//       .map(entry => entry.name);

//     console.log(`📁 Found ${repoDirs.length} potential repositories: ${repoDirs.join(', ')}`);

//     let repairedCount = 0;
//     let existingCount = 0;

//     for (const repoName of repoDirs) {
//       const repoPath = path.join(REPOS_PATH, repoName);
//       console.log(`🔍 Checking repository: ${repoName} at ${repoPath}`);
      
//       // Check if it's actually a git repository
//       const hasGit = fs.existsSync(path.join(repoPath, '.git'));
//       const hasHead = fs.existsSync(path.join(repoPath, 'HEAD'));
//       console.log(`   - Has .git: ${hasGit}, Has HEAD: ${hasHead}`);
      
//       if (!hasGit && !hasHead) {
//         console.log(`⚠️  Skipping '${repoName}' - not a git repository`);
//         continue;
//       }

//       // Check if auth config already exists
//       const existingConfig = await authPersistence.loadRepositoryConfig(repoName);
//       console.log(`   - Existing config: ${existingConfig ? 'YES' : 'NO'}`);
      
//       if (existingConfig) {
//         console.log(`✅ Repository '${repoName}' already has auth config`);
//         existingCount++;
//       } else {
//         console.log(`🔧 Creating auth config for orphaned repository '${repoName}'`);
        
//         // Create a basic auth config - in production you'd want to specify the actual admin
//         // For now, we'll create a placeholder that requires manual admin assignment
//         const repairConfig = {
//           authorized_keys: [
//             // Add your default admin pubkey here, or leave empty for manual setup
//             { pubkey: 'npub19jlhl9twyjajarvrjeeh75a5ylzngv4tj8y9wgffsguylz9eh73qd85aws', access: 'admin' }
//           ],
//           metadata: {
//             description: `Auto-discovered repository: ${repoName}`,
//             type: 'unknown',
//             created: new Date().toISOString(),
//             auto_repaired: true
//           }
//         };

//         await authPersistence.saveRepositoryConfig(repoName, repairConfig);
//         console.log(`✅ Created auth config for '${repoName}'`);
//         repairedCount++;
//       }
//     }

//     console.log(`📊 Repository scan complete: ${existingCount} existing configs, ${repairedCount} repaired`);

//   } catch (error) {
//     console.error('❌ Error scanning repositories:', error);
//     // Don't throw - allow server to start even if scan fails
//   }
// }

// Auth middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ status: 'error', reason: 'Invalid or expired token' });
      }

      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ status: 'error', reason: 'No authentication token provided' });
  }
};

// Simple token validation for auth endpoints (no RepoId required)
// const validateAuthToken = (req, res, next) => {
//   const authHeader = req.headers.authorization;
//   console.log('🔧 DEBUG: validateAuthToken', authHeader?.substring(0, 50) + '...');
  
//   const result = utils.processAuthToken(authHeader, JWT_SECRET);
//   console.log('🔧 processAuthToken result:', result);

//   if (!result.success) {
//     console.error('❌ Auth failed:', result.error);
//     return res.status(401).json({
//       status: 'error',
//       reason: result.error 
//     });
//   }
  
//   // console.log('validateAuthToken, result.decoded: ', result.decoded);
//   req.user = result.decoded;
//   next();
// };

// validates the MGitToken which includes RepoId
// Simplified: Just validate JWT and check repo access
// const validateMGitToken = async (req, res, next) => {
//   const authHeader = req.headers.authorization;
  
//   if (!authHeader) {
//     return res.status(401).json({ 
//       status: 'error', 
//       reason: 'Authentication required' 
//     });
//   }

//   // Verify JWT is valid
//   const result = utils.processAuthToken(authHeader, JWT_SECRET);
  
//   if (!result.success) {
//     return res.status(401).json({ 
//       status: 'error', 
//       reason: result.error 
//     });
//   }
  
//   req.user = result.decoded;
  
//   // If this route has a repoId, check if user has access
//   if (req.params.repoId) {
//     const { pubkey } = result.decoded;
//     const accessCheck = await checkRepoAccess(req.params.repoId, pubkey);
    
//     if (!accessCheck.success) {
//       return res.status(accessCheck.status).json({ 
//         status: 'error', 
//         reason: accessCheck.error 
//       });
//     }
    
//     // Add access level to request for downstream handlers
//     req.user.access = accessCheck.access;
//   }
  
//   next();
// };

// setupWebRTCRoutes(app, validateAuthToken);

// Ensure repositories directory exists
if (!fs.existsSync(REPOS_PATH)) {
  fs.mkdirSync(REPOS_PATH, { recursive: true });
}

app.get('/api/auth/:type/status', (req, res) => {
  const { type } = req.params;
  const { k1 } = req.query;
  
  console.log(`Status check for ${type}:`, k1);
  
  if (!pendingChallenges.has(k1)) {
    return res.status(400).json({ status: 'error', reason: 'Challenge not found' });
  }

  const challenge = pendingChallenges.get(k1);
  console.log('Challenge status:', challenge);

  res.json({
    status: challenge.verified ? 'verified' : 'pending',
    nodeInfo: challenge.verified ? {
      pubkey: challenge.pubkey
    } : null
  });
});

// Token validation endpoint
app.get('/api/auth/validate', jwtOnly, (req, res) => {
  console.log('/api/auth/validate called with auth: ',  req.headers.authorization);
  // If we get here, the token is valid (jwtOnly middleware passed)
  res.json({
    status: 'valid',
    userId: req.user.userId
  });
});

/* 
* NOSTR Login Functionality
*
* Flow:
* User authenticates via existing /api/auth/nostr/verify → gets JWT token
* Call /api/auth/register with token → creates user profile
* User is now registered and logged in
*/

// Add this function right after your imports and before your routes
// This is the corrected metadata fetching function based on your working test
function fetchNostrMetadata(pubkey, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    // Try multiple relays in order of preference
    const relays = [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://relay.nostr.band'
    ];
    
    let currentRelayIndex = 0;
    
    function tryNextRelay() {
      if (currentRelayIndex >= relays.length) {
        reject(new Error('All relays failed to provide metadata'));
        return;
      }
      
      const relayUrl = relays[currentRelayIndex++];
      console.log(`Trying relay: ${relayUrl}`);
      
      tryFetchFromRelay(relayUrl, pubkey, timeoutMs / relays.length)
        .then(resolve)
        .catch((error) => {
          console.log(`Relay ${relayUrl} failed: ${error.message}`);
          tryNextRelay();
        });
    }
    
    tryNextRelay();
  });
}

function tryFetchFromRelay(relayUrl, pubkey, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl);
    let metadataReceived = false;
    
    const timeout = setTimeout(() => {
      if (!metadataReceived) {
        ws.close();
        reject(new Error('Metadata fetch timeout'));
      }
    }, timeoutMs);

    ws.onopen = () => {
      const subscriptionId = `metadata-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const req = JSON.stringify([
        "REQ",
        subscriptionId,
        {
          "kinds": [0],
          "authors": [pubkey],
          "limit": 1
        }
      ]);
      console.log(`Sending request to ${relayUrl}: ${req}`);
      ws.send(req);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const [type, subscriptionId, eventData] = data;
        
        console.log(`Received from ${relayUrl}: ${event.data}`);
        
        if (type === 'EVENT' && eventData && eventData.kind === 0) {
          // Found metadata!
          metadataReceived = true;
          clearTimeout(timeout);
          ws.close();
          
          // Parse the metadata content
          const parsedMetadata = parseMetadataContent(eventData.content);
          resolve(parsedMetadata);
          
        } else if (type === 'EOSE') {
          // End of stored events - no metadata found on this relay
          if (!metadataReceived) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error('No metadata found on this relay'));
          }
        }
      } catch (parseError) {
        console.log(`Parse error from ${relayUrl}: ${parseError.message}`);
        // Continue listening for more messages
      }
    };

    ws.onerror = (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${error.message || 'Connection failed'}`));
    };

    ws.onclose = (event) => {
      if (!metadataReceived && event.code !== 1000) {
        clearTimeout(timeout);
        reject(new Error(`WebSocket closed unexpectedly: ${event.code}`));
      }
    };
  });
}

function parseMetadataContent(contentString) {
  if (!contentString) {
    return null;
  }

  try {
    const content = JSON.parse(contentString);
    return {
      name: content.name || '',
      display_name: content.display_name || content.displayName || '',
      about: content.about || '',
      picture: content.picture || '',
      nip05: content.nip05 || '',
      banner: content.banner || '',
      website: content.website || '',
      lud06: content.lud06 || '',
      lud16: content.lud16 || ''
    };
  } catch (error) {
    console.log('Failed to parse metadata content:', error.message);
    return null;
  }
}

app.get('/api/auth/nostr/status', (req, res) => {
  const { challenge } = req.query;
  
  if (!pendingChallenges.has(challenge)) {
    return res.status(400).json({ 
      status: 'error', 
      reason: 'Challenge not found' 
    });
  }

  const challengeData = pendingChallenges.get(challenge);
  
  // Only return status for Nostr challenges
  if (challengeData.type !== 'nostr') {
    return res.status(400).json({ 
      status: 'error', 
      reason: 'Invalid challenge type' 
    });
  }

  res.json({
    status: challengeData.verified ? 'verified' : 'pending',
    userInfo: challengeData.verified ? {
      pubkey: challengeData.pubkey
    } : null
  });
});

// NEW ENDPOINTS FOR MGIT REPOSITORY-SPECIFIC AUTH

// 1. Repository-specific challenge generation
// app.post('/api/mgit/auth/challenge', async (req, res) => {
//   const { repoId } = req.body;
  
//   console.log(`=== CHALLENGE DEBUG ===`);
//   console.log(`Requested repoId: ${repoId}`);
//   console.log(`REPOS_PATH: ${REPOS_PATH}`);

//   if (!repoId) {
//     return res.status(400).json({ 
//       status: 'error', 
//       reason: 'Repository ID is required in the request.body' 
//     });
//   }

//   // Check if repository exists using filesystem check
//   const repoPath = path.join(REPOS_PATH, repoId);

//   console.log(`Checking repoPath: ${repoPath}`);
//   console.log(`repoPath exists: ${fs.existsSync(repoPath)}`);

//   // Check for bare repository structure (HEAD, config, objects, refs)
//   const headFile = path.join(repoPath, 'HEAD');
//   const configFile = path.join(repoPath, 'config');
//   const objectsDir = path.join(repoPath, 'objects');
//   const refsDir = path.join(repoPath, 'refs');

//   const isBareRepo = fs.existsSync(headFile) && fs.existsSync(configFile) && 
//                     fs.existsSync(objectsDir) && fs.existsSync(refsDir);
//   const isRegularRepo = fs.existsSync(path.join(repoPath, '.git'));

//   console.log(`HEAD exists: ${fs.existsSync(headFile)}`);
//   console.log(`config exists: ${fs.existsSync(configFile)}`);
//   console.log(`objects exists: ${fs.existsSync(objectsDir)}`);
//   console.log(`refs exists: ${fs.existsSync(refsDir)}`);
//   console.log(`Is bare repo: ${isBareRepo}`);
//   console.log(`Is regular repo: ${isRegularRepo}`);
//   console.log(`========================`);

//   // if (!fs.existsSync(repoPath) || (!isBareRepo && !isRegularRepo)) {
//   //   console.log(`Repository check FAILED - returning 404`);
//   //   return res.status(404).json({ 
//   //     status: 'error', 
//   //     reason: 'Repository not found' 
//   //   });
//   // }
//   const repoConfig = await authPersistence.loadRepositoryConfig(repoId);
//   if (!repoConfig) {
//     return res.status(404).json({ 
//       status: 'error', 
//       reason: 'Repository not found' 
//     });
//   }

//   const challenge = crypto.randomBytes(32).toString('hex');
  
//   // Store the challenge with repository info
//   pendingChallenges.set(challenge, {
//     timestamp: Date.now(),
//     verified: false,
//     pubkey: null,
//     repoId,
//     type: 'mgit'
//   });

//   console.log(`Generated MGit challenge for repo ${repoId}:`, challenge);

//   res.json({
//     challenge,
//     repoId
//   });
// });

// // 2. Verify signature and check repository authorization
// app.post('/api/mgit/auth/verify', async (req, res) => {
//   const { signedEvent, challenge, repoId } = req.body;
  
//   // Validate request parameters
//   if (!signedEvent || !challenge || !repoId) {
//     return res.status(400).json({ 
//       status: 'error', 
//       reason: 'Missing required parameters' 
//     });
//   }

//   // Check if the challenge exists
//   if (!pendingChallenges.has(challenge)) {
//     return res.status(400).json({ 
//       status: 'error', 
//       reason: 'Invalid or expired challenge' 
//     });
//   }

//   const challengeData = pendingChallenges.get(challenge);
  
//   // Verify the challenge is for the requested repository
//   if (challengeData.repoId !== repoId) {
//     return res.status(400).json({ 
//       status: 'error', 
//       reason: 'Challenge does not match repository' 
//     });
//   }
  
//   try {
//     // Validate the event format
//     if (!validateEvent(signedEvent)) {
//       return res.status(400).json({ 
//         status: 'error', 
//         reason: 'Invalid event format' 
//       });
//     }

//     // Verify the event signature
//     if (!verifyEvent(signedEvent)) {
//       return res.status(400).json({ 
//         status: 'error', 
//         reason: 'Invalid signature' 
//       });
//     }

//     // Check the event content (should contain the challenge)
//     if (!signedEvent.content.includes(challenge)) {
//       return res.status(400).json({ 
//         status: 'error', 
//         reason: 'Challenge mismatch in signed content' 
//       });
//     }

//     // Check if the pubkey is authorized for the repository
//     const pubkey = signedEvent.pubkey;
//     const accessCheck = await checkRepoAccess(repoId, pubkey);
//     console.log('accessCheck: ', accessCheck);

//     if (!accessCheck.success) {
//       return res.status(accessCheck.status).json({ 
//         status: 'error', 
//         reason: accessCheck.error 
//       });
//     }

//     // Update challenge status
//     pendingChallenges.set(challenge, {
//       ...challengeData,
//       verified: true,
//       pubkey
//     });

//     // Generate a temporary access token for repository operations
//     const token = jwt.sign({
//       pubkey,
//       repoId,
//       access: accessCheck.access
//     }, JWT_SECRET, {
//       expiresIn: TOKEN_EXPIRATION
//     });

//     console.log(`MGit auth successful - pubkey ${pubkey} granted ${accessCheck.access} access to repo ${repoId}`);
    
//     res.json({ 
//       status: 'OK',
//       token,
//       access: accessCheck.access,
//       expiresIn: TOKEN_EXPIRATION
//     });

//   } catch (error) {
//     console.error('MGit auth verification error:', error);
//     res.status(500).json({ 
//       status: 'error', 
//       reason: 'Verification failed: ' + error.message 
//     });
//   }
// });

/**
 * Auto-create a bare repository and auth config for push-to-create workflow.
 * Called when a push targets a repo that doesn't exist yet.
 */
// async function autoCreateRepository(repoId, ownerPubkey) {
//   const repoPath = path.join(REPOS_PATH, repoId);

//   console.log(`📦 Auto-creating repository '${repoId}' for pubkey ${ownerPubkey}`);

//   // Initialize bare git repo
//   const { execSync } = require('child_process');
//   fs.mkdirSync(repoPath, { recursive: true });
//   execSync(`${GIT_PATH} init --bare`, { cwd: repoPath });

//   // Create auth config with pushing user as admin owner
//   const newConfig = {
//     authorized_keys: [{ pubkey: ownerPubkey, access: 'admin' }],
//     metadata: {
//       description: 'Auto-created by push-to-create',
//       type: 'medical-binder',
//       created: new Date().toISOString(),
//       auto_created: true
//     }
//   };

//   await authPersistence.saveRepositoryConfig(repoId, newConfig);
//   console.log(`✅ Auto-created repository '${repoId}' with owner ${ownerPubkey}`);

//   return repoPath;
// }

/*
 * MGit Repository API Endpoints
 */
app.get('/api/mgit/repos/:repoId/show', authMiddleware, (req, res) => {
  const { repoId } = req.params;
  
  // Get the physical repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Check if repository exists
  if (!fs.existsSync(repoPath)) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'Repository not found' 
    });
  }

  // Execute mgit status command for now
  const { exec } = require('child_process');
  // the current working directory of exec is private_repos/hello-world
  exec(`${GIT_PATH} show`, { cwd: repoPath }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing git show: ${error.message}`);
      return res.status(500).json({ 
        status: 'error', 
        reason: 'Failed to execute mgit show',
        details: error.message
      });
    }
    
    if (stderr) {
      console.error(`mgit show stderr: ${stderr}`);
    }
    
    // Return the output from mgit show
    res.setHeader('Content-Type', 'text/plain');
    res.send(stdout);
  });
});

app.get('/api/mgit/repos/:repoId/clone', authMiddleware, (req, res) => {
  const { repoId } = req.params;
  const { access } = req.user;
  
  // Check if the user has access to the repository
  if (access !== 'admin' && access !== 'read-write' && access !== 'read-only') {
    return res.status(403).json({ 
      status: 'error', 
      reason: 'Insufficient permissions to access repository' 
    });
  }
  
  // Get the repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Check if the repository exists
  if (!fs.existsSync(repoPath)) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'Repository not found' 
    });
  }
  
  console.log(`Executing mgit status for repository ${repoId}`);
  
  // Execute mgit show command
  const { exec } = require('child_process');
  exec(`${GIT_PATH} log --oneline --graph --decorate=short --all`, { cwd: repoPath }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing mgit clone: ${error.message}`);
      return res.status(500).json({ 
        status: 'error', 
        reason: 'Failed to execute mgit clone',
        details: error.message
      });
    }
    
    if (stderr) {
      console.error(`mgit clone stderr: ${stderr}`);
    }
    
    // Return the output from mgit show
    res.setHeader('Content-Type', 'text/plain');
    res.send(stdout);
  });
});

// QR Code generation endpoint-- used for mobile mgit clone
app.get('/api/mgit/qr/clone/:repoId', authMiddleware, async (req, res) => {
  const { repoId } = req.params;
  
  try {
    // Create the QR code data
    const qrData = {
      action: "mgit_clone",
      clone_url: `${getBaseUrl(req)}/api/mgit/repos/${repoId}`,
      jwt_token: req.headers.authorization.split(' ')[1], // Extract token from Bearer header
      repo_name: repoId
    };

    // Generate SVG QR code
    const qrCodeSVG = await QRCode.toString(JSON.stringify(qrData), {
      type: 'svg',
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(qrCodeSVG);
  } catch (error) {
    console.error('QR code generation error:', error);
    res.status(500).json({
      status: 'error',
      reason: 'Failed to generate QR code',
      details: error.message
    });
  }
});

/**
 * Git create-bare and create endpoints
 */
app.post('/api/mgit/repos/create-bare', jwtOnly, async (req, res) => {
  try {
    const { repoName } = req.body;
    const { userId } = req.user;

    if (!repoName) {
      return res.status(400).json({
        status: 'error',
        reason: 'Repository name is required'
      });
    }

    const normalizedRepoName = repoName.trim().replace(/\s+/g, '-').toLowerCase();
    const repoPath = path.join(REPOS_PATH, normalizedRepoName);

    if (fs.existsSync(repoPath)) {
      return res.status(409).json({
        status: 'error',
        reason: 'Repository directory already exists'
      });
    }

    // Create bare repo on disk
    fs.mkdirSync(repoPath, { recursive: true });
    await execAsync('git init --bare', { cwd: repoPath });
    await execAsync(`echo "ref: refs/heads/main" > ${repoPath}/HEAD`);
    console.log(`✅ Created bare repository at ${repoPath}`);

    // Register in auth-api
    try {
      await authApiClient.registerRepo({
        repoId: normalizedRepoName,
        ownerUserId: userId,
        description: 'Encrypted medical repository',
        repoType: 'medical-history'
      });
    } catch (err) {
      // Rollback: delete the repo directory
      fs.rmSync(repoPath, { recursive: true, force: true });
      throw err;
    }

    console.log(`✅ Registered auth config for ${normalizedRepoName}`);

    res.json({
      status: 'OK',
      repoId: normalizedRepoName,
      message: 'Bare repository created successfully. Client can now push encrypted commits.'
    });

  } catch (error) {
    console.error('Bare repository creation error:', error);
    res.status(500).json({
      status: 'error',
      reason: 'Failed to create bare repository',
      details: error.message
    });
  }
});

app.post('/api/mgit/repos/create', jwtOnly, async (req, res) => {
  try {
    const { userId } = req.user;
    const { repoName, userName, userEmail, description } = req.body;

    if (!repoName || !userName || !userEmail) {
      return res.status(400).json({
        status: 'error',
        reason: 'Display name, user name, and email are required'
      });
    }

    const repoPath = path.join(REPOS_PATH, repoName);
    if (fs.existsSync(repoPath)) {
      return res.status(409).json({
        status: 'error',
        reason: 'Repository already exists'
      });
    }

    // Create the repository on disk
    console.log('REPOS_PATH:', REPOS_PATH);
    const repoResult = await mgitUtils.createRepository(repoName, userName, userEmail, userId, description, REPOS_PATH);

    if (!repoResult.success) {
      return res.status(500).json({
        status: 'error',
        reason: 'Failed to create repository',
        details: repoResult.error
      });
    }

    // Register in auth-api
    try {
      await authApiClient.registerRepo({
        repoId: repoName,
        ownerUserId: userId,
        description: description || 'Medical repository',
        repoType: 'medical-history'
      });
    } catch (err) {
      // Rollback: delete the repo directory
      fs.rmSync(repoPath, { recursive: true, force: true });
      throw err;
    }

    console.log(`✅ Registered auth config for '${repoName}'`);

    res.json({
      status: 'OK',
      repoId: repoName,
      repoPath: repoResult.repoPath,
      cloneUrl: `http://localhost:3003/${repoName}`,
      message: 'Repository created successfully'
    });

  } catch (error) {
    console.error('Repository creation error:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        reason: 'Token expired'
      });
    }

    return res.status(500).json({
      status: 'error',
      reason: 'Repository creation failed: ' + error.message
    });
  }
});

/* 
  Functions needed to re-implement git's protocol for sending and receiving data
*/
// discovery phase of git's https smart discovery protocol
// Sample endpoint for repository info - protected by token validation
app.get('/api/mgit/repos/:repoId/info', authMiddleware, async (req, res) => {
  const { repoId } = req.params;
  const { userId, access } = req.user; // From the general token

  // Return repository info with user's access level
  res.json({
    id: repoId,
    name: `${repoId}`,
    access,
    userId
  });
});

app.get('/api/mgit/repos/:repoId/info/refs', authMiddleware, async (req, res) => {
  const { repoId } = req.params;
  const service = req.query.service;

  // Validate service
  if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
    return res.status(400).json({
      status: 'error',
      reason: 'Service not supported'
    });
  }

  // push to create flow
  const repoPath = path.join(REPOS_PATH, repoId);
  if (!fs.existsSync(repoPath)) {
    // Push-to-create: only JWT users can create repos, not scan tokens
    if (service !== 'git-receive-pack') {
      return res.status(404).json({
        status: 'error',
        reason: 'Repository not found'
      });
    }

    if (req.user.authMethod === 'scan_token') {
      return res.status(404).json({
        status: 'error',
        reason: 'Repository not found (scan tokens cannot create repos)'
      });
    }

    // Create bare repo on disk
    fs.mkdirSync(repoPath, { recursive: true });
    await execAsync('git init --bare', { cwd: repoPath });
    await execAsync(`echo "ref: refs/heads/main" > ${repoPath}/HEAD`);
    console.log(`✅ Push-to-create: initialized bare repo at ${repoPath}`);

    // Register in auth-api
    try {
      await authApiClient.registerRepo({
        repoId,
        ownerUserId: req.user.userId,
        description: 'Auto-created on first push',
        repoType: 'medical-history'
      });
      console.log(`✅ Push-to-create: registered ${repoId} in auth-api`);
    } catch (err) {
      // Rollback: delete the repo directory
      fs.rmSync(repoPath, { recursive: true, force: true });
      console.error(`❌ Push-to-create: failed to register ${repoId}`, err);
      return res.status(500).json({
        status: 'error',
        reason: 'Failed to register repository'
      });
    }
  }

  // Set appropriate headers
  res.setHeader('Content-Type', `application/x-${service}-advertisement`);
  res.setHeader('Cache-Control', 'no-cache');

  // Format the packet properly
  const serviceHeader = `# service=${service}\n`;
  const length = (serviceHeader.length + 4).toString(16).padStart(4, '0');
  res.write(length + serviceHeader);
  res.write('0000');

  const gitCommand = service.replace('git-', '');
  console.log(`Advertising refs for ${repoId} using ${service}`);

  const { spawn } = require('child_process');
  const proc = spawn('git', [gitCommand, '--stateless-rpc', '--advertise-refs', repoPath]);

  proc.stdout.pipe(res);

  proc.stderr.on('data', (data) => {
    console.error(`git ${gitCommand} stderr: ${data}`);
  });

  proc.on('error', (err) => {
    console.error(`Error spawning git process: ${err}`);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        reason: 'Error advertising refs',
        details: err.message
      });
    }
  });
});

// Git protocol endpoint for git-upload-pack (needed for clone)
// data transfer phase
app.post('/api/mgit/repos/:repoId/git-upload-pack', authMiddleware, async (req, res) => {
  const { repoId } = req.params;
  const repoPath = path.join(REPOS_PATH, repoId);

  console.log(`POST git-upload-pack for ${repoId}`);

  res.setHeader('Content-Type', 'application/x-git-upload-pack-result');

  const { spawn } = require('child_process');
  const proc = spawn('git', ['upload-pack', '--stateless-rpc', repoPath]);

  req.pipe(proc.stdin);
  proc.stdout.pipe(res);

  proc.stderr.on('data', (data) => {
    console.error(`git-upload-pack stderr: ${data.toString()}`);
  });

  proc.on('error', (err) => {
    console.error(`git-upload-pack process error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).send('Git error');
    }
  });

  proc.on('exit', (code) => {
    console.log(`git-upload-pack process exited with code ${code}`);
  });
});

// Git protocol endpoint for git-receive-pack (needed for push)
app.post('/api/mgit/repos/:repoId/git-receive-pack', authMiddleware, async (req, res) => {
  const { repoId } = req.params;
  const repoPath = path.join(REPOS_PATH, repoId);

  console.log(`POST git-receive-pack for ${repoId}`);

  res.setHeader('Content-Type', 'application/x-git-receive-pack-result');

  const { spawn } = require('child_process');
  const proc = spawn('git', ['receive-pack', '--stateless-rpc', repoPath]);

  req.pipe(proc.stdin);
  proc.stdout.pipe(res);

  proc.stderr.on('data', (data) => {
    console.error(`git-receive-pack stderr: ${data.toString()}`);
  });

  proc.on('error', (err) => {
    console.error(`git-receive-pack process error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        reason: 'Git error',
        details: err.message
      });
    }
  });

  proc.on('exit', (code) => {
    console.log(`git-receive-pack process exited with code ${code}`);
    if (code === 0) {
      console.log(`Successfully processed push for repository ${repoId}`);
    }
  });
});

// Endpoint to get MGit-specific metadata (e.g., nostr mappings)
app.get('/api/mgit/repos/:repoId/metadata', authMiddleware, (req, res) => {
  const { repoId } = req.params;

  // Get the repository path
  const repoPath = path.join(REPOS_PATH, repoId);
  
  // Check if the repository exists
  if (!fs.existsSync(repoPath)) {
    return res.status(404).json({ 
      status: 'error', 
      reason: 'Repository not found' 
    });
  }
  
  // Updated path to check both potential locations for mappings
  const mappingsPaths = [
    path.join(repoPath, '.mgit', 'mappings', 'hash_mappings.json'),  // New location
    path.join(repoPath, '.mgit', 'nostr_mappings.json')               // Old location
  ];
  
  let mappingsPath = null;
  
  // Find the first existing mappings file
  for (const path of mappingsPaths) {
    if (fs.existsSync(path)) {
      mappingsPath = path;
      break;
    }
  }
  
  // If no mappings file exists
  if (!mappingsPath) {
    // Create an empty mappings file in the new location
    mappingsPath = mappingsPaths[0];
    const mgitDir = path.dirname(mappingsPath);
    
    if (!fs.existsSync(path.dirname(mgitDir))) {
      fs.mkdirSync(path.dirname(mgitDir), { recursive: true });
    }
    
    if (!fs.existsSync(mgitDir)) {
      fs.mkdirSync(mgitDir, { recursive: true });
    }
    
    fs.writeFileSync(mappingsPath, '[]');
    console.log(`Created empty mappings file at ${mappingsPath}`);
  }
  
  // Read the mappings file
  try {
    const mappingsData = fs.readFileSync(mappingsPath, 'utf8');
    
    // Set content type and send the mappings data
    res.setHeader('Content-Type', 'application/json');
    res.send(mappingsData);
    console.log(`Successfully served mappings from ${mappingsPath}`);
  } catch (err) {
    console.error(`Error reading nostr mappings: ${err.message}`);
    res.status(500).json({ 
      status: 'error', 
      reason: 'Failed to read MGit metadata',
      details: err.message
    });
  }
});

// delete a binder repo (JWT owner only)
app.delete('/api/mgit/repos/:repoId', jwtOnly, async (req, res) => {
  const { repoId } = req.params;
  const { userId } = req.user;

  try {
    // Verify caller owns this repo via auth-api
    const access = await authApiClient.checkAccess({
      userId,
      repoId,
      operation: 'write'
    });

    if (!access.allowed || access.access !== 'admin') {
      return res.status(403).json({ status: 'error', reason: 'Not authorized to delete this repository' });
    }

    // Delete auth config from DB (CASCADE removes repository_access rows)
    try {
      await authApiClient.deleteRepoConfig(repoId);
    } catch (err) {
      console.error(`Failed to delete auth config for ${repoId}:`, err.message);
      return res.status(500).json({ status: 'error', reason: 'Failed to delete repository config' });
    }

    // Delete bare repo from disk
    const repoPath = path.join(REPOS_PATH, repoId);
    if (fs.existsSync(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true });
      console.log(`Deleted bare repo directory: ${repoPath}`);
    }

    console.log(`Binder deleted: repoId=${repoId}, userId=${userId}`);
    res.json({ status: 'OK', repoId });
  } catch (error) {
    console.error('Delete repo error:', error);
    res.status(500).json({ status: 'error', reason: 'Failed to delete repository' });
  }
});

// show repos of a user
app.get('/api/mgit/user/repositories', jwtOnly, async (req, res) => {
  try {
    console.log('USER REPOSITORIES LIST');
    const { userId } = req.user;

    const repos = await authApiClient.getUserRepositories(userId);

    // Map to the shape the frontend expects
    const userRepositories = repos.map(r => ({
      name: r.repoId,
      id: r.repoId,
      description: r.description || '',
      created: r.createdAt || new Date().toISOString(),
      type: r.repoType || 'repository',
      access: r.access || 'read-only'
    }));

    console.log('user repos:', userRepositories);
    res.json(userRepositories);
  } catch (error) {
    console.error('Error fetching user repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// health check
app.get('/api/health', async (req, res) => {
  try {
    const reposDirExists = fs.existsSync(REPOS_PATH);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: {
        node_env: process.env.NODE_ENV || 'development',
        repos_path: REPOS_PATH
      },
      auth: {
        method: 'auth-api',
        url: process.env.AUTH_API_URL || 'http://auth-api:3010'
      },
      storage: {
        repos_directory_exists: reposDirExists
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Start the server
const PORT = process.env.PORT || 3003;
// app.listen(PORT, async () => {
//   await ensureUsersDirectory();
//   console.log(`Server running on port ${PORT}`);
//   console.log(`Access the application at http://localhost:${PORT}`);
// });

const { startCleanupJob } = require('./stagingCleanup');

initializeServer().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ MGit Repository Server running on port ${PORT}`);
    console.log(`✅ Auth: delegating to auth-api`);
    console.log(`✅ Repositories path: ${REPOS_PATH}`);
  });

  startCleanupJob();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    server.close();
    process.exit(0);
  });
}).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
