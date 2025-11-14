Perfect. Here's the complete renaming map:
https://claude.ai/chat/159040d9-fc61-4d88-8986-ed9cc4aee656
## Backend Route Renaming

### admin.js → Split into multiple files

**Move to `/api/auth/*` (or keep in auth-api):**
```
OLD: /api/admin/user-lookup/:pubkey     → NEW: /api/auth/lookup/:pubkey
OLD: /api/admin/me                       → NEW: /api/auth/me
OLD: /api/admin/register-user            → NEW: /api/auth/register  (already in auth-api?)
OLD: /api/admin/database-test            → NEW: /api/debug/database-test
```

**Move to `/api/services/*`:**
```
OLD: /api/admin/services                 → NEW: /api/services
OLD: /api/admin/services/:id             → NEW: /api/services/:id
OLD: /api/admin/service-categories       → NEW: /api/service-categories
```

**Move to `/api/settings/*`:**
```
OLD: /api/admin/working-plan             → NEW: /api/settings/working-plan
```

### appointments.js

```
OLD: /api/appointments/verify-booking         → KEEP (already resource-based)
OLD: /api/appointments/dashboard-login        → KEEP
OLD: /api/appointments/validate-login-token   → KEEP
OLD: /api/admin/appointments                  → NEW: /api/appointments
OLD: /api/admin/appointments/completed/:id    → NEW: /api/appointments/completed/:id
OLD: /api/admin/appointments/:id/invoice      → NEW: /api/appointments/:id/invoice
```

### billing.js

```
OLD: /api/admin/billing/stats                           → NEW: /api/billing/stats
OLD: /api/admin/billing/appointments/:id/invoice        → NEW: /api/billing/appointments/:id/invoice
OLD: /api/admin/billing/appointments/:id/send-dm        → NEW: /api/billing/appointments/:id/send-dm
```

### providers.js

```
OLD: /api/admin/providers                        → NEW: /api/providers
OLD: /api/admin/providers/:id/services           → NEW: /api/providers/:id/services
OLD: /api/providers/:id/availability             → KEEP (already correct!)
OLD: /api/admin/provider/:username/profile       → NEW: /api/providers/:username/profile
OLD: /api/admin/provider/profile                 → NEW: /api/providers/profile
OLD: /api/admin/provider/profile-pic             → NEW: /api/providers/profile-pic
OLD: /api/admin/uploads/profiles/:filename       → NEW: /api/uploads/profiles/:filename
```

### webrtc.js

```
All /api/appointments/* routes           → KEEP
All /api/patients/* routes                → KEEP
All /api/webrtc/* routes                  → KEEP
```

---

## Frontend Changes

```typescript
// Step4Confirmation.tsx
'/api/appointments/verify-booking'           // NO CHANGE

// Step1ProviderService.tsx
'/api/admin/providers'                       → '/api/providers'

// WebRTCTest.tsx
'/api/admin/appointments'                    → '/api/appointments'

// ServicesManager.tsx
'/api/admin/services'                        → '/api/services'
'/api/admin/service-categories'              → '/api/service-categories'

// DatabaseTest.tsx
'/api/admin/database-test'                   → '/api/debug/database-test'

// LoginPage.tsx
'/api/google/login/start'                    // KEEP (or move to auth-api?)

// CalendarPage.tsx
'/api/admin/appointments'                    → '/api/appointments'
'/api/admin/working-plan'                    → '/api/settings/working-plan'

// BillingPage.tsx
'/api/admin/billing/stats'                   → '/api/billing/stats'
'/api/admin/me'                              → '/api/auth/me'

// EditProfile.tsx
'/api/admin/provider/profile-pic'            → '/api/providers/profile-pic'
'/api/auth/generate-nostr'                   // KEEP

// auth.ts (AuthService)
'/api/admin/register-user'                   → '/api/auth/register'
'/api/admin/user-lookup/:pubkey'             → '/api/auth/lookup/:pubkey'

// settingsService.ts
'/api/admin/user/settings'                   → '/api/settings/user'
'/api/admin/user/nwc-connection'             → '/api/settings/nwc-connection'

// bookingService.ts
'/api/providers'                             // NO CHANGE (already correct!)
'/api/services'                              // Already expecting new route!
'/api/appointments/verify-booking'           // NO CHANGE
'/api/appointments/dashboard-login'          // NO CHANGE

// repoService.ts
'/api/mgit/*'                                // NO CHANGE (mgit-api routes)
```

---

## Summary

**Total backend route changes:** ~25 routes
**Total frontend fetch changes:** ~15 files

**Files to reorganize:**
1. `admin.js` → Split into `auth.js`, `services.js`, `settings.js`, `debug.js`
2. Other route files → Just change route prefixes (remove `/admin/`)

**Biggest win:** Removing `/api/admin/` prefix throughout. Routes become resource-based rather than role-based.

**Question:** Should `/api/auth/me` and `/api/auth/register` stay in scheduler-api, or move to auth-api? If auth-api, then frontend calls auth-api directly (gateway routes it). If scheduler-api, it's just a route rename.