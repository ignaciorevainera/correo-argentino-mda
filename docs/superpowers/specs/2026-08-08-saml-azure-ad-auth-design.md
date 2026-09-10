# SAML Azure AD Authentication Design

## Overview
Replace internal username/password authentication with SAML 2.0 integration against Azure AD as Identity Provider (IdP). The application acts as Service Provider (SP).

## Architecture

### Dependencies
- `passport` - authentication middleware
- `passport-saml` - SAML 2.0 strategy for Passport
- `@types/passport`, `@types/passport-saml` - TypeScript types

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `SAML_ENTRY_POINT` | Azure AD SSO URL (e.g. `https://login.microsoftonline.com/{tenant}/saml2`) | Yes |
| `SAML_ISSUER` | SP Entity ID (e.g. `https://mda.correoargentino.com.ar`) | Yes |
| `SAML_CALLBACK_URL` | Assertion Consumer Service URL (e.g. `https://mda.correoargentino.com.ar/auth/saml/callback`) | Yes |
| `SAML_IDP_CERT` | Azure AD public certificate (X.509, PEM format) for validating SAML Response signatures | Yes |
| `SAML_PRIVATE_KEY` | SP private key (PEM) for signing AuthnRequests (optional) | No |
| `SAML_PUBLIC_KEY` | SP public certificate (PEM) for encryption (optional) | No |

### Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/auth/saml/login` | GET | Initiate SAML AuthnRequest, redirect to Azure AD |
| `/auth/saml/callback` | POST | Assertion Consumer Service - receive and validate SAML Response |

### SAML Flow
1. User clicks "Iniciar sesión con Azure AD" on login page
2. `GET /auth/saml/login` → Passport generates AuthnRequest (signed if private key configured), redirects to `SAML_ENTRY_POINT`
3. User authenticates at Azure AD
4. Azure AD POSTs SAML Response to `SAML_CALLBACK_URL`
5. `POST /auth/saml/callback` → Passport validates Response:
   - Signature verification using `SAML_IDP_CERT`
   - Issuer matches `SAML_ISSUER`
   - Audience matches SP Entity ID
   - NotBefore/NotOnOrAfter time window
   - InResponseTo matches initiated request (RelayState)
6. Extract claims from SAML Response: `email`, `displayName`, `firstName`, `lastName` (via attribute statements)
7. Find user in DB by `samlNameId` (UPN) or `username` (email) fallback
8. If not found → auto-provision: create user with `username = email`, `role = 'guest'` (default, minimal privileges), random password
9. Create session using existing `session.ts` utilities, set `session_id` cookie
10. Redirect to `/` or original requested URL (via RelayState)

### Group-to-Role Mapping
**No se utiliza.** Azure AD solo autentica identidad. Roles se gestionan localmente:
- Todos los usuarios nuevos entran con rol `guest` (rank 0, mismo acceso que no autenticado)
- Promoción de rol se hace desde `/admin/usuarios`
- No se configuran Group claims en Azure AD

### Login Page Changes
- Add button "Iniciar sesión con Azure AD" → links to `/auth/saml/login`
- Keep existing username/password form as fallback (admin-created local accounts)

### Middleware
No changes required. Existing session validation in `middleware.ts` continues to work.

### Logout
- Local logout via existing `/logout` endpoint (deletes session, clears cookie)
- SAML Single Logout (SLO) optional for future enhancement

## Database Schema Changes
Add optional `samlNameId` column to `users` table for persistent NameID mapping (future-proofing):
```sql
ALTER TABLE users ADD COLUMN samlNameId TEXT UNIQUE;
```

## Security Considerations
- Validate all SAML Response fields per SAML 2.0 spec
- Use secure cookies (HTTPS in production)
- Store `SAML_IDP_CERT` and `SAML_PRIVATE_KEY` in environment, never in code
- Implement replay attack protection via InResponseTo/RelayState
- Rate limit `/auth/saml/callback` endpoint

## Testing
- Unit tests for group→role mapping
- Integration test: mock SAML Response → verify user creation/session
- E2E test: full flow (requires Azure AD test tenant or mock IdP)

## Rollout Plan
1. Deploy with both auth methods active
2. Test with pilot group
3. Migrate users gradually
4. Optionally disable local login after full migration