# `/scan` Endpoint Requirements

## Overview

The `/scan` endpoint enables doctor-patient interactions through a QR code workflow that provides temporary, time-limited access to patient medical records. This implements the "Carbon Copy Pink Sheet" model, where doctors receive a temporary snapshot of patient data during appointments without requiring platform accounts.

## Core Principles

- **Patient-driven**: Patient explicitly grants access by displaying QR code
- **Server-blind**: All medical data remains encrypted; server cannot read contents
- **Time-limited**: Access expires after 1 hour
- **Zero friction**: Doctors require no Limbo Health account
- **EMR integration**: Cached browser data enables entry into existing EMR systems

## User Flow

### 1. Patient Generates QR Code (Mobile App)
- Patient opens Limbo Health mobile app
- Navigates to "Share with Doctor" or similar UI
- App generates ephemeral key pair for this session
- QR code displays on phone screen
- QR code remains valid for 1 hour from generation

### 2. Doctor Scans QR Code (Web Interface)
- Doctor visits `limbo.health/scan` on clinic computer
- Web interface requests webcam access
- Doctor holds patient's phone up to webcam
- System scans and validates QR code
- If valid and not expired, doctor proceeds to dashboard

### 3. Doctor Reviews Medical History
- Doctor sees decrypted patient medical history
- Full read access to all notes, images, and documents in patient's repo
- Browser caches this data locally (survives 1hr expiration)
- Doctor can navigate through patient's timeline

### 4. Doctor Adds Clinical Notes
- Doctor writes clinical notes in web form
- Doctor takes photo of medical badge for signature
- System encrypts note + badge photo using temporary encryption key
- Encrypted data commits directly to patient's encrypted git repository

### 5. Post-Appointment Workflow
- After 1hr, temporary keys expire (no fresh data access)
- Doctor retains cached browser copy of patient data
- Doctor can:
  - Print cached data for records
  - Manually enter into existing EMR system
  - Delegate to receptionist for data entry

## QR Code Specification

### Contents
```json
{
  "temporaryDecryptionKey": "hex-encoded-private-key",
  "temporaryEncryptionKey": "hex-encoded-public-key", 
  "repoIdentifier": "patient-repo-id",
  "expiresAt": 1234567890,
  "endpoint": "https://git.limbo.health/repos/{repoId}/doctor-note"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `temporaryDecryptionKey` | string | Ephemeral private key allowing decryption of patient's repo contents |
| `temporaryEncryptionKey` | string | Ephemeral public key for encrypting new doctor notes |
| `repoIdentifier` | string | Unique identifier for patient's encrypted git repository |
| `expiresAt` | number | Unix timestamp (current time + 3600 seconds) |
| `endpoint` | string | POST URL for submitting encrypted doctor notes |

### Security Properties
- Keys are ephemeral (generated per-session, not derived from patient's master keys)
- Decryption key allows read access to existing encrypted blobs
- Encryption key allows write access for new notes
- Keys expire after 1 hour (validated server-side)
- QR code generation rotates keys (previous sessions invalidated)

## Web Interface Requirements (`limbo.health/scan`)

### Initial State
- Clean, minimal UI
- Large "Scan QR Code" button
- Brief explanation: "Have your patient show their Limbo Health QR code"
- Privacy notice: "Access expires in 1 hour"

### QR Scanning
- Request webcam permission on user action (not auto-request)
- Live camera feed with QR code detection overlay
- Visual feedback when QR detected
- Automatic validation and transition on successful scan

### Error Handling
| Error | User Message | Action |
|-------|--------------|--------|
| Webcam denied | "Camera access required to scan QR codes" | Prompt to enable in browser settings |
| Invalid QR | "This is not a valid Limbo Health QR code" | Allow retry |
| Expired QR | "This QR code has expired. Ask patient to generate a new one." | Return to scan screen |
| Network error | "Unable to connect. Check your internet connection." | Retry button |

### Patient Dashboard (Post-Scan)

#### Header
- Patient name (if available in repo metadata)
- Session expiration countdown timer
- "Add Note" button (primary action)

#### Medical History View
- Chronological timeline of all medical entries
- Each entry shows:
  - Date/timestamp
  - Note content (decrypted)
  - Attached images (decrypted)
  - Author signature (if available)
- Smooth scrolling, infinite scroll for large histories
- Search/filter functionality

#### Add Note Modal
- Rich text editor for clinical notes
- Image upload for badge photo ("Sign with your badge")
- Character count (no limit for now)
- "Cancel" and "Submit" buttons
- Loading state during encryption and submission

### Browser Caching
- Use IndexedDB or localStorage for caching decrypted patient data
- Cache persists beyond 1hr expiration
- Cache cleared on:
  - Explicit user action ("Clear Session")
  - Browser close (optional, configurable)
  - New QR scan (overwrites previous patient data)

## Backend Requirements

### Endpoint: `POST /repos/{repoId}/doctor-note`

#### Authentication
- Validate `temporaryEncryptionKey` matches QR session
- Verify `expiresAt` timestamp hasn't passed
- No user account required

#### Request Body
```json
{
  "encryptedNote": "base64-encoded-encrypted-blob",
  "encryptedBadgePhoto": "base64-encoded-encrypted-image",
  "timestamp": 1234567890,
  "sessionToken": "qr-session-identifier"
}
```

#### Response
```json
{
  "success": true,
  "commitHash": "abc123...",
  "message": "Note added successfully"
}
```

#### Error Responses
| Status | Error | Reason |
|--------|-------|--------|
| 401 | `SESSION_EXPIRED` | QR code timestamp passed |
| 404 | `REPO_NOT_FOUND` | Invalid repoIdentifier |
| 400 | `INVALID_ENCRYPTION` | Malformed encrypted data |
| 413 | `PAYLOAD_TOO_LARGE` | Note exceeds size limit (future) |

### Git Commit Behavior
- Doctor note commits directly to patient's encrypted repository
- Commit message: `"Doctor note added via /scan - {timestamp}"`
- Commit author: `"Doctor (Badge Verified)" <scan@limbo.health>`
- Files added:
  - `notes/{timestamp}-doctor-note.enc` (encrypted note)
  - `notes/{timestamp}-badge.enc` (encrypted badge photo)

### Session Management
- Generate unique session ID when QR scanned
- Track active sessions in memory/Redis
- Automatically cleanup expired sessions
- Rate limiting: Max 5 scans per IP per hour (prevent abuse)

## Mobile App Requirements (QR Generation)

### UI Flow
1. Patient taps "Share with Doctor" button
2. Confirmation modal: "This will give your doctor temporary access to your medical records for 1 hour"
3. "Generate QR Code" button
4. Full-screen QR code display
5. Countdown timer showing expiration
6. "Generate New Code" button (invalidates current)

### Crypto Implementation
```javascript
// Pseudocode
const sessionKeyPair = generateEphemeralKeyPair(); // NIP-44 compatible
const qrData = {
  temporaryDecryptionKey: sessionKeyPair.privateKey,
  temporaryEncryptionKey: sessionKeyPair.publicKey,
  repoIdentifier: patient.repoId,
  expiresAt: Date.now() + 3600000, // 1 hour
  endpoint: `${GIT_SERVER_URL}/repos/${patient.repoId}/doctor-note`
};
displayQRCode(JSON.stringify(qrData));
```

### Security Considerations
- Ephemeral keys must NOT be derived from patient's master Nostr keys
- QR code should be unreadable if screenshot/photo'd (display-only security)
- Warn patient if screen recording detected (platform-dependent)

## Encryption Specification

### Encryption Algorithm
- Use NIP-44 encryption standard (same as repo encryption)
- Ephemeral keys compatible with patient's master key scheme
- Doctor notes encrypted with `temporaryEncryptionKey`
- Patient's master key can decrypt all ephemeral-encrypted notes

### Key Relationships
```
Patient Master Key (Nostr)
  ├─ Encrypts/decrypts all repo contents
  └─ Can decrypt notes encrypted with ephemeral keys

Ephemeral Session Keys (per QR code)
  ├─ Private key → Doctor decrypts existing notes
  └─ Public key → Doctor encrypts new notes
```

### Compatibility
- Ephemeral-encrypted notes must be decryptable by patient's master key
- Use shared secret derivation or key wrapping to enable this
- Implementation details: [Reference NIP-44 spec]

## Non-Functional Requirements

### Performance
- QR scan latency: < 2 seconds from detection to dashboard
- Medical history load: < 3 seconds for repos up to 100MB
- Note submission: < 5 seconds including encryption and commit

### Browser Compatibility
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers supported but not optimized (desktop clinic use is primary)

### Accessibility
- Keyboard navigation for all controls
- Screen reader support for timeline
- High contrast mode for QR scanning

### Privacy
- No analytics tracking on `/scan` endpoint
- No logging of decrypted medical data
- Encrypted data only touches browser memory, never disk (except IndexedDB cache)

## Future Enhancements (Out of Scope)

- [ ] Granular permissions (read-only vs read-write QR codes)
- [ ] Multi-doctor QR codes (multiple practitioners in same appointment)
- [ ] Audit log visible to patient (who accessed when)
- [ ] Automatic EMR export (HL7 FHIR format)
- [ ] Video consultation integration (QR scan from within video call)
- [ ] Offline mode (doctor caches patient data before appointment)

## Open Questions

1. **Should cached browser data have a "print" button for paper copies?**
   - Useful for EMR data entry workflow
   - Potential privacy concern if left on shared computer

2. **How should we handle doctor identification without accounts?**
   - Currently relying on badge photo only
   - Consider: NPI number input, medical license verification

3. **Should patients receive notifications when doctor adds notes?**
   - Mobile push notification?
   - In-app badge counter?

4. **What happens if patient's app is offline when doctor submits note?**
   - Note waits in encrypted staging area?
   - Patient syncs next time app opens?

5. **Maximum repo size limits for /scan performance?**
   - Should we paginate large histories?
   - Lazy-load images?

## Success Metrics

- QR scan success rate > 95%
- Average time from QR scan to doctor dashboard < 5 seconds
- Zero decryption failures for valid sessions
- Doctor satisfaction with EMR integration workflow
- Patient comfort level with temporary access model

## Dependencies

- Encrypted git repository system (limbo-health main branch)
- isomorphic-git library (web and mobile)
- NIP-44 encryption implementation
- WebRTC video calling (future integration)
- QR code generation library (mobile): `react-native-qrcode-svg`
- QR code scanning library (web): `html5-qrcode` or similar
