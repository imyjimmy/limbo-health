// security.js - Configuration file for MGit server security

const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Security configuration for Express app
const configureSecurity = (app) => {
  // Use Helmet for secure HTTP headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'", "chrome-extension:", "moz-extension:"],
        connectSrc: ["'self'", "wss:", "https:", "chrome-extension:", "moz-extension:"],
        imgSrc: ["'self'", "data:", "https:", "chrome-extension:", "moz-extension:"],
        styleSrc: ["'self'", "'unsafe-inline'", "chrome-extension:", "moz-extension:"],
        fontSrc: ["'self'", "data:", "chrome-extension:", "moz-extension:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"]
      }
    }
  }));
  
  // Rate limiting to prevent brute force attacks
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { status: 'error', reason: 'Too many requests, please try again later.' }
  });
  
  // Apply rate limiting to authentication endpoints
  app.use('/api/auth', apiLimiter);
  
  // Verify that REPOS_PATH is outside the public directory
  const ensureSecurePath = () => {
    const REPOS_PATH = process.env.REPOS_PATH || path.join(__dirname, '..', 'private_repos');
    const PUBLIC_PATH = path.join(__dirname, 'public');
    
    // Resolve to absolute paths
    const reposAbsolute = path.resolve(REPOS_PATH);
    const publicAbsolute = path.resolve(PUBLIC_PATH);
    
    // Check if repos path is inside public path
    if (reposAbsolute.startsWith(publicAbsolute)) {
      console.error('SECURITY ERROR: Repository path is inside the public web directory!');
      console.error(`Repos path: ${reposAbsolute}`);
      console.error(`Public path: ${publicAbsolute}`);
      process.exit(1); // Exit the application for security
    }
    
    // Create the repos directory if it doesn't exist
    if (!fs.existsSync(reposAbsolute)) {
      fs.mkdirSync(reposAbsolute, { recursive: true });
    }
    
    console.log(`Repository storage configured at: ${reposAbsolute}`);
    console.log(`Public web files served from: ${publicAbsolute}`);
    
    return reposAbsolute;
  };
  
  // Setup path validation
  const validatePath = (requestPath) => {
    // Prevent path traversal attacks by checking for suspicious patterns
    const suspicious = /(\.\.|~|\\|\$|\/\/)/g;
    return !suspicious.test(requestPath);
  };
  
  return {
    ensureSecurePath,
    validatePath
  };
};

module.exports = configureSecurity;