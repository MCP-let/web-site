# MCPlet Specification v202603-01

> **Status**: Draft  
> **Date**: 2026-03-05  
> **Relationship to MCP / MCP Apps**: MCPlet is a **convention profile** on top of MCP + MCP Apps. It does not redefine transport, runtime, or sandbox behavior.

---

## 1. Purpose and Scope

### 1.1 Purpose

MCPlet defines a constrained, AI-first capability unit with:

- one business intent,
- one primary MCP tool contract,
- optional MCP Apps UI,
- explicit safety boundaries for model vs app invocation,
- host-managed state and orchestration.

The goal is predictable, reviewable, and secure AI-tool interaction.

### 1.2 Non-goals

MCPlet does **not**:

- redefine MCP protocol transport or JSON-RPC semantics,
- redefine MCP Apps lifecycle or sandboxing,
- require a specific frontend framework,
- require database or backend architecture changes,
- provide its own identity/auth system.

### 1.3 Normative References

The following are normative:

- Model Context Protocol (MCP)
- MCP Apps Extension Specification

Where UI rendering, iframe lifecycle, app-bridge events, or host-view communication are concerned, MCP Apps is authoritative.

---

## 2. Design Principles

### 2.1 Code-First (Primary)

MCPlet v202602-08 adopts a **Code-First** model:

- tool metadata is declared at registration time,
- tool result schema is exposed as MCP Resources,
- visibility and display mode are expressed in tool `_meta.ui`.

`mcplet.yaml` is no longer required for core runtime behavior.

### 2.2 Security Boundaries by Visibility

Tool Visibility is the primary boundary between what an LLM can invoke and what must remain app-triggered with user interaction.

### 2.3 Host-Orchestrated State

MCPlets are stateless units. Conversation state, cross-tool context, and UI data flow are managed by the host.

### 2.4 Progressive Enhancement

All MCPlets must remain usable in text-only mode. UI is optional enhancement.

---

## 3. Core Concepts

### 3.1 MCPlet

A smallest reviewable AI-operable unit representing exactly one intent.

### 3.2 Intent

Human-readable purpose independent from UI or transport.

### 3.3 Host

The MCP client/agent shell that:

- discovers tools/resources,
- invokes tools,
- renders MCP Apps UI,
- enforces policy (visibility, mode, safety),
- holds conversation state.

---

## 4. MCPlet Classification

Each MCPlet tool contract MUST declare one `mcpletType` via the `_meta.mcpletType` field:

- `read`: side-effect free, idempotent, safe for autonomous model invocation.
- `prepare`: gathers/validates data; no irreversible side effects.
- `action`: causes side effects; MUST require explicit user confirmation at host/app layer.

### 4.1 `mcpletType` Declaration

The `mcpletType` field MUST be declared inside `_meta` at registration time:

```typescript
registerAppTool(
  server,
  'search_restaurants',
  {
    title: 'Search Restaurants',
    description: 'Search for restaurants by name, cuisine, or location',
    inputSchema: SearchRestaurantsSchema,
    _meta: {
      mcpletType: 'read',        // MUST declare one of: read | prepare | action
      ui: {
        resourceUri: SEARCH_RESOURCE_URI,
        visibility: ['model']
      }
    }
  },
  handler
);
```

### 4.2 Recommended Combinations: mcpletType x Visibility x Auth

The following table provides guidance on recommended combinations of `mcpletType`, `visibility`, and `auth`:

| `mcpletType` | Recommended `visibility` | `auth.required` | Rationale |
|---|---|---|---|
| `read` | `['model']` or `['model','app']` | SHOULD NOT | Safe, idempotent; suitable for autonomous AI invocation |
| `prepare` | `['model','app']` or `['app']` | MAY | No irreversible effects, but user visibility is useful |
| `action` | `['app']` | SHOULD | Irreversible effects require human confirmation |
| `action` | `['model']` | MUST NOT (unless host intercepts) | Dangerous: model could invoke side-effects autonomously |
| `action` | `['model','app']` | MUST (if model-visible) | If exposed to model, auth interception is mandatory |

**Key rules**:

- `action` tools with `visibility` containing `'model'` MUST have Passkey authentication or equivalent host interception to prevent unconfirmed side effects.
- `read` tools SHOULD NOT require Passkey authentication, as they are side-effect free.
- Host MUST validate that `action` tools are not exposed to model without appropriate safeguards.

---

## 5. Packaging and Metadata Profiles

### 5.1 Primary Profile: Code-First Registration

MCPlet-compliant tools SHOULD be registered through server-side helper patterns equivalent to:

- `registerModelTool(...)`
- `registerAppTool(...)`
- `registerDualTool(...)`

A registration MUST provide:

- `name`
- `description`
- `inputSchema`
- `_meta.mcpletType`
- `_meta.ui.visibility`

It SHOULD provide:

- `_meta.ui.resourceUri`
- `_meta.ui.displayMode`
- `_meta.ui.mcpletToolResultSchemaUri`
- `_meta.auth` (SHOULD for `action` type tools)

### 5.2 Compatibility Profile: YAML-based Configuration

`mcplet.yaml` MAY be used as a backward-compatibility source for host defaults (for example display mode fallback), but MUST NOT be the single source of truth when code metadata is present.

When both are present, code metadata takes precedence.

---

## 6. Tool Metadata Contract (`_meta`)

The following fields are defined for MCPlet profile under `_meta`:

```json
{
  "_meta": {
    "mcpletType": "read",
    "ui": {
      "resourceUri": "ui://restaurant/search-app.html",
      "visibility": ["model"],
      "displayMode": "inline",
      "mcpletToolResultSchemaUri": "mcplet://tool-result-schema/search_restaurants"
    },
    "auth": {
      "required": "passkey",
      "promptMessage": "Please authenticate with Passkey to confirm"
    }
  }
}
```

### 6.1 `mcpletType`

MCPlet classification type. MUST be one of: `"read"`, `"prepare"`, `"action"`.

See Section 4 for semantics and Section 4.2 for recommended combinations with visibility and auth.

### 6.2 `ui.resourceUri`

MCP Apps UI resource URI.

### 6.3 `ui.visibility`

Array of allowed invocation surfaces:

- `['model']`
- `['app']`
- `['model','app']`

### 6.4 `ui.displayMode`

Allowed values:

- concrete: `inline | fullscreen | pip`
- llm-decided extension: `llm-inline | llm-fullscreen | llm-pip`

### 6.5 `ui.mcpletToolResultSchemaUri`

URI to an MCP Resource containing the tool-result schema payload.

### 6.6 `auth`

Authentication requirements for this tool. See Section 7.3 for full specification.

- `auth.required`: The type of authentication required. Currently only `'passkey'` is defined.
- `auth.promptMessage`: Message displayed to user during authentication prompt.

---

## 7. Passkey Authentication
MCPlet provides built-in Passkey support to enable fast and sensitive operation authentication without affecting the AI user experience.

### 7.1 Passkey Authentication Implementation

MCPlet Passkey authentication implementation includes two aspects:

#### 7.1.1 Tool Metadata Declaration

MCPlet Tool MAY declare authentication requirements in their `_meta.auth` metadata:

```typescript
registerAppTool(
  server,
  'create_reservation',
  {
    title: 'Create Reservation',
    description: 'Make a restaurant reservation',
    inputSchema: CreateReservationSchema,
    _meta: {
      mcpletType: 'action',
      ui: {
        resourceUri: SEARCH_RESOURCE_URI,
        visibility: ['app']
      },
      auth: {
        required: 'passkey',
        promptMessage: 'Please authenticate with Passkey to confirm your reservation'
      }
    }
  },
  handler
);
```

**Requirements**:
- Tool `_meta` SHOULD include `auth` field to declare authentication requirements
- `auth` MUST be placed inside `_meta` (sibling of `ui` and `mcpletType`), NOT at the top level of tool config
- Host/orchestrator MUST validate and enforce `_meta.auth.required` before tool execution
- SDK/client MUST support `auth` field in tool `_meta` configuration types
- `action` type tools SHOULD declare `_meta.auth` for explicit human verification

---

#### 7.1.2 Host Implementation Based on FIDO2-UI-SDK

Host is responsible for implementing specific Passkey functionality based on amiPro FIDO2-UI-SDK:

##### 7.1.2.1 Passkey Registration and Authentication

- When authenticating and finding that the user has not registered a Passkey, guide the user to register first, then proceed to authentication
- Registration alone does NOT authorize tool invocation; authentication MUST always follow
- Complete flow: Check availability -> Resolve userId -> Check if registration needed -> Register (if needed) -> **Authenticate** -> Tool invocation

```typescript
const ensurePasskeyForSensitiveAction = async (options: {
  actionPrompt: string;
  registerPrompt: string;
  userIdPrompt: string;
}): Promise<boolean> => {
  const passkeyAuth = new PasskeyAuthHelper(fidoServerUrl);
  
  // 1. Check availability
  const availability = passkeyAuth.checkAvailability();
  if (!availability.available) {
    await UI.alert(availability.reason || 'Passkey not available', { title: 'Passkey' });
    return false;
  }
  
  // 2. Resolve user ID (from localStorage or prompt)
  const userId = await passkeyAuth.resolveUserId(options.userIdPrompt);
  if (!userId) return false;
  
  // 3. Check if registration needed, register if not
  if (!passkeyAuth.auth.canTryAutoAuthentication()) {
    const wantsToRegister = await UI.confirm(options.registerPrompt, {
      title: 'Passkey',
      okLabel: 'Register',
      cancelLabel: 'Cancel'
    });
    if (!wantsToRegister) return false;
    
    const regResult = await passkeyAuth.register(userId, userId);
    if (!regResult.success) {
      await UI.alert(`Registration failed: ${regResult.error}`, { title: 'Passkey' });
      return false;
    }
  }
  
  // 4. Always authenticate (registration does NOT skip this step)
  const authResult = await passkeyAuth.login(userId);
  if (!authResult.success) {
    await UI.alert(`Authentication failed: ${authResult.error}`, { title: 'Passkey' });
    return false;
  }
  
  return true;
};
```

##### 7.1.2.2 Passkey Device Management

Host SHOULD provide user-facing functionality to manage Passkey devices:
- View list of registered Passkey devices
- Add new Passkey device
- Delete registered Passkey device

##### 7.1.2.3 Session Validity Assurance

- Host is responsible for ensuring users register Passkey within a valid session
- User identity must be verified before Passkey registration (e.g., user is already logged in)
- Session management (validation, expiration) is Host's responsibility

> **Note**: "Session" here refers to the FIDO2 server session used during the registration/authentication ceremony, NOT a persistent login session. MCPlet Passkey does not maintain persistent sessions -- every tool call requiring Passkey triggers a fresh authentication (see Section 7.2).

### 7.2 Passkey Authentication Workflow

MCPlet Passkey authentication follows these phases:

> **Important**: Passkey in MCPlet does not have the concept of persistent Session. All Tool calls that require Passkey authentication will start a fresh Passkey authentication process.

#### Phase 1: Availability Check

The host MUST verify WebAuthn support and FIDO2 SDK readiness:

- Check browser WebAuthn API availability (`window.PublicKeyCredential`)
- Verify FIDO2 SDK is loaded (`window.registerFido2`, `window.authenticateFido2`)
- FIDO2 server URL is configured by host

If unavailable, the host SHOULD display user-friendly guidance and block the tool invocation.

#### Phase 2: User ID Resolution

Host MUST determine the user identity for Passkey operations:

1. Check localStorage for previously stored user ID
2. If not found, prompt user to enter a user ID
3. Store resolved user ID for future operations

#### Phase 3: Registration (First-Time User)

If no passkey credentials exist for this user/device (`canTryAutoAuthentication()` returns `false`):

1. Host prompts user: "Register Passkey?" or similar
2. User selects authenticator (fingerprint, face, security key, PIN protector)
3. FIDO2 server generates attestation challenge
4. User confirms with authenticator
5. Attestation credential is sent to FIDO2 server for validation
6. Server stores credential public key; client stores authenticator reference
7. **After registration, proceed to Phase 4 (Authentication)**. Registration alone does NOT authorize tool access.

#### Phase 4: Authentication

Authentication is ALWAYS required before tool invocation, whether the user just registered or is a returning user:

1. Host checks for auto-authentication possibility (e.g., platform passkey with biometric)
2. If auto-auth is possible, proceeds without explicit prompt
3. Otherwise, host displays: `auth.promptMessage`
4. User selects authenticator or confirms biometric/platform passkey
5. FIDO2 server generates assertion challenge
6. User confirms with authenticator
7. Assertion signature is sent to FIDO2 server for verification
8. Server validates signature against stored credential public key
9. Proceed to Phase 5 if authenticated

#### Phase 5: Tool Invocation

After successful authentication:

1. Host invokes tool (via MCP protocol) with authenticated context
2. Tool execution proceeds with assurance of user authentication
3. For tools with passkey auth required, users are required to authenticate each call using passkey authentication

### 7.3 Tool Authentication Contract (`_meta.auth`)

The following fields are defined for Passkey authentication in MCPlet:

```json
{
  "_meta": {
    "mcpletType": "action",
    "ui": {
      "resourceUri": "ui://restaurant/search-app.html",
      "visibility": ["app"],
      "displayMode": "inline"
    },
    "auth": {
      "required": "passkey",
      "promptMessage": "Please authenticate with Passkey to confirm"
    }
  }
}
```

### 7.3.1 `auth.required`

The type of authentication required for this tool. Currently only `'passkey'` is defined.

### 7.3.2 `auth.promptMessage`

The message displayed to user during authentication prompt.

Example: `"Please authenticate with Passkey to confirm reservation"`

#### Key Principles

- Host layer manages UI state (`isLoading`, `isAuthenticating`) with proper loading guards
- On `ontoolinput` callback, host MUST clear previous results to avoid stale data rendering
- All content rendering MUST be guarded with loading state (e.g., `!isLoading && renderContent()`)

### 7.4 Relying Party ID (`rpId`)

#### 7.4.1 Overview

The WebAuthn Relying Party ID (`rpId`) determines the domain scope of Passkey credentials. MCPlet supports both FIDO2 server-determined and client-specified `rpId`.

#### 7.4.2 Determination Rules

The `rpId` is determined as follows (in priority order):

1. **Explicit client override**: If the caller explicitly passes `rpId` to `register()`, `authenticate()`, or other Passkey functions, that value is sent to the FIDO2 server as `rp: { id: rpId }`.

2. **FIDO2 server default** (normal case): If `rpId` is `null` or omitted (the default), the FIDO2 server determines the `rpId` based on its own configuration. During authentication, the server returns `rpId` in its assertion options response, which the client uses in the `navigator.credentials.get()` call.

```typescript
// Client-side rpId handling in FIDO2 SDK:

// Registration (doAttestation):
if (rpId && 0 < rpId.length) {
    attestationOptions.rp = { id: rpId };  // Explicit override
}
// If rpId is null, no rp field is sent -> server uses its default

// Authentication (doAssertion):
if (rpId && 0 < rpId.length) {
    authnOptions.rp = { id: rpId };        // Explicit override
}
// Server response contains rpId, used in navigator.credentials.get():
const cred = await navigator.credentials.get({
    publicKey: {
        rpId: resp.rpId,  // Server-provided rpId
        // ...
    }
});
```

#### 7.4.3 Implementation Guidance

- In most deployments, applications SHOULD NOT specify `rpId` and let the FIDO2 server determine it. The `rpId` parameters in `PasskeyAuth.register()` and `PasskeyAuth.authenticate()` default to `null`.
- Custom `rpId` MAY be used for cross-subdomain credential sharing (e.g., registering on `app.example.com` and authenticating on `admin.example.com` with `rpId: 'example.com'`).
- The `rpId` MUST be a registrable domain suffix of the current origin. For example, on `https://app.example.com`, valid `rpId` values include `app.example.com` or `example.com`, but NOT `other.com`.
- Device management functions (`listDevices`, `deleteDevice`) and session validation (`validateSession`) also accept optional `rpId` for consistency.

### 7.5 Enabling and Disabling Passkey

#### 7.5.1 Enabling Passkey

Passkey authentication is enabled when all of the following conditions are met:

1. **FIDO2 SDK loaded**: HTML includes `dfido2-lib.js` and `fido2-ui-sdk.js` scripts
2. **FIDO2 Server URL configured**: `PasskeyAuthHelper` instantiated with a valid HTTPS FIDO2 server URL
3. **Tool metadata declares auth**: `_meta.auth.required` set to `'passkey'` on the tool
4. **Client enforces auth**: Application calls `ensurePasskeyForSensitiveAction()` (or equivalent) before invoking the protected tool

#### 7.5.2 Disabling Passkey

Passkey can be disabled at three granularity levels:

| Level | Method | Effect |
|-------|--------|--------|
| **Global** | Remove FIDO2 SDK `<script>` tags from HTML | `PasskeyAuth.isSdkLoaded()` returns `false`; all Passkey operations fail gracefully with "Passkey not available" |
| **Per-tool** | Remove `_meta.auth` field from tool metadata | Tool no longer declares authentication requirement; host/client should not enforce Passkey |
| **Per-operation** | Skip `ensurePasskeyForSensitiveAction()` call in client code | Tool invoked directly without authentication; useful for development/testing |

**Recommendation**: Levels 1 (Global) and 2 (Per-tool) SHOULD be applied together to ensure server declarations and client behavior remain consistent. Level 3 (Per-operation) is appropriate only for local development and testing.

### 7.6 Security Considerations

#### Credential Storage

- Client credential references MUST be stored securely (browser localStorage with HTTPS, or platform authenticator storage)
- Credential secret keys MUST NEVER be exposed to JavaScript or transmitted to server
- FIDO2 server MUST validate attestation statements and store only public keys

#### Session Lifecycle

- Passkey in MCPlet does not have the concept of persistent Session. All Tool calls that require Passkey authentication will start a fresh Passkey authentication process.
- The FIDO2 server-side session (used during registration/authentication ceremonies) is transient and managed by the FIDO2 SDK internally.

#### Error Handling

Implementations MUST handle:

- WebAuthn API unavailable -> stop tool calling and show user guidance
- User cancellation (Esc key, timeout) -> stop tool calling silently (do NOT show error dialog for user-initiated cancellations)
- FIDO2 server connectivity failure -> error message + host-driven retry
- Attestation/assertion verification failure -> specific error reason (e.g., signature mismatch) and stop tool calling
- Credential not found -> prompt for registration if allowed by policy

#### Visibility Coordination

- Tools with `mcpletType: "action"` and `auth.required: "passkey"` SHOULD typically have `visibility: ['app']` to enforce authentication before model can invoke
- If exposing `action` tools to LLM (visibility `['model']` or `['model','app']`), app or host MUST implement request interception to enforce authentication before forwarding to model
- `read` type tools (visibility `['model']`) SHOULD NOT require Passkey auth

### 7.7 Error Handling Details (Informative)

Common error scenarios and recommended handling:

| Error | Scenario | Recommended Response |
|-------|----------|----------------------|
| `NotSupportedError` | Browser lacks WebAuthn API (older Safari, IE) | Show message: "Passkey not supported on this device. Please upgrade browser or use alternative auth." |
| `NotAllowedError` | User pressed Esc or authenticator timed out | Silently fail and allow user to retry; do NOT show error message |
| `InvalidStateError` | Credential already registered | Show message: "This device is already registered. Log in instead." |
| `UnknownError` (network) | FIDO2 server unreachable | Show message: "Authentication server unavailable. Please try again later." |
| `verification failure` | Server rejecting attestation/assertion | Log as security event; show message: "Authentication failed. Please try again." |

### 7.8 Testing and Local Development (Informative)

For MCPlet development with Passkey authentication:

1. **Local FIDO2 Server**: Use e.g. `https://local.dqj-macpro.com` (requires self-signed certificate and hosts entry)
2. **Virtual Authenticators**: Use Chrome DevTools Credentials panel to emulate hardware authenticators without physical device
3. **Test Scenarios**:
   - First-time registration flow
   - Returning user auto-authentication
   - Authentication cancellation
   - FIDO2 server failure/timeout

---

## 8. Tool Visibility

### 8.1 Allowed Configurations

MCPlet v202602-08 supports exactly three visibility configurations:

1. `['model']` (Model-only)
2. `['app']` (App-only)
3. `['model','app']` (Dual-visible)

### 8.2 Enforcement Rules

Host MUST enforce filtering:

- LLM tool list MUST include tools where visibility contains `model`.
- App-triggered internal calls MUST use tools where visibility contains `app`.
- App-only tools MUST be hidden from LLM tool schema.

### 8.3 Security Guidance

- `action` type tools SHOULD be app-only (`visibility: ['app']`),
- `read` type tools SHOULD be model-visible (`visibility: ['model']` or `['model','app']`),
- dual-visible tools SHOULD be limited to safe or explicitly auditable operations,
- `action` tools exposed to model MUST have `_meta.auth` or equivalent host interception (see Section 4.2).

### 8.4 Out of Scope

MCPlet v1 does not standardize role-based visibility values (`admin`, `authenticated`, etc.). AuthZ remains host responsibility.

---

## 9. Tool Result Envelope and Schema Resources

### 9.1 Recommended Result Envelope

MCPlet recommends a normalized envelope:

```json
{
  "result": {},
  "_meta": {
    "timestamp": "2026-02-15T00:00:00.000Z",
    "toolId": "search_restaurants",
    "mcpletType": "read",
    "visibility": ["model"]
  }
}
```

For errors:

```json
{
  "error": {
    "message": "...",
    "code": "UNKNOWN_ERROR"
  },
  "_meta": {
    "timestamp": "2026-02-15T00:00:00.000Z",
    "toolId": "search_restaurants",
    "mcpletType": "read"
  }
}
```

### 9.2 Requirement Level

- The exact envelope is **SHOULD** (recommended, not hard-required).
- If a tool declares `mcpletToolResultSchemaUri`, returned payloads intended for derived injection MUST validate against that schema.
- `mcpletType` in result `_meta` enables downstream consumers (host, AI) to reason about the safety profile of the result without re-consulting tool registration metadata.

### 9.3 Schema URI Convention

Canonical convention:

- v1: `mcplet://tool-result-schema/{toolId}`
- vN: `mcplet://tool-result-schema/{toolId}/v{major}`

### 9.4 Schema Resource Payload

Schema resources SHOULD include:

```json
{
  "version": 2,
  "schema": { "type": "object" },
  "_meta": {
    "createdAt": "2026-02-15T00:00:00.000Z",
    "deprecated": false,
    "deprecatedAt": null,
    "sunsetDate": null
  }
}
```

### 9.5 Versioning and Deprecation

- breaking schema change MUST use new major schema URI,
- old versions SHOULD be marked deprecated,
- deprecation SHOULD provide a sunset window (recommended: >= 3 months).

---

## 10. Derived Tool Result Channel

### 10.1 Purpose

Allow host-validated model-derived results to be injected into standard tool-result flow without changing app UI contracts. This enables LLM text responses to synchronously drive UI updates in iframes without requiring explicit user tool invocation.

### 10.2 Use Case: LLM-Driven iframe Synchronization

After LLM generates a text response, the host MAY inject a derived result to synchronize iframe content:

**Flow**:
1. User sends message to LLM in chat
2. LLM processes and generates text response (e.g., "Here are restaurants matching your criteria")
3. Host extracts structured data from LLM response or context
4. Host creates derived result matching tool schema for iframe tool
5. Host injects derived result via Derived Tool Result Channel
6. iframe automatically displays updated content synchronized with LLM text response

**Example**: 
- User asks: "Show me French restaurants in Shibuya"
- LLM calls SearchApp tool to get all French restaurants data, because SearchApp only has the ability to search for restaurants, not to filter by location
- LLM searches restaurants in Shibuya from SearchApp tool's response
- LLM responds: "I found 3 French restaurants..."
- Host injects derived result with search results to SearchApp iframe
- iframe displays results in sync with text response

### 10.3 Local Injection Tool

Host MAY expose a local-only tool (for example `mcplet_set_tool_result`) for model-side structured result shaping:

```typescript
// Host-provided tool for LLM to shape results
{
  name: 'mcplet_set_tool_result',
  description: 'Set derived result for a tool to sync iframe',
  inputSchema: {
    type: 'object',
    properties: {
      toolId: { type: 'string', description: 'Target tool ID' },
      result: { type: 'object', description: 'Structured result matching tool schema' }
    },
    required: ['toolId', 'result']
  }
}
```

The host infrastructure then routes this to the Derived Tool Result Channel internally.

### 10.4 Validation and Safety

Before setting pending derived result, host MUST:

- verify target tool allowlist (only whitelisted tools can receive derived results),
- resolve target schema URI (e.g., `mcplet://tool-result-schema/search_restaurants`),
- validate JSON payload against schema,
- enforce payload size limit (recommended: <= 1MB),
- enforce TTL upper bound (recommended: <= 30 seconds),
- enforce revision monotonicity if revision is used.

### 10.5 iframe Synchronization Protocol

iframe tools MUST:

1. **Register for derived results**: Listen to host via MCP Apps bridge for `tool-result-update` events
2. **Consume derived result**: Extract result payload and update UI state
3. **Preserve navigation**: Maintain iframe state (scroll position, form state) when injecting derived result
4. **Handle expiration**: Discard stale results (older than TTL)
5. **Fallback behavior**: On invalid result, app MAY display placeholder or allow user to retry

**Sample iframe event listener**:
```typescript
// Inside fullscreen iframe app (e.g., SearchApp)
window.addEventListener('message', (event) => {
  if (event.data.type === 'tool-result-update') {
    const { toolId, result, timestamp } = event.data;
    
    // 1. Verify this is for this tool
    if (toolId !== 'search_restaurants') return;
    
    // 2. Check TTL (reject if older than 30s)
    const age = Date.now() - timestamp;
    if (age > 30000) return; // Expired
    
    // 3. Update state with derived result
    setRestaurants(result.restaurants);
    setSearchState('complete');
  }
});
```

### 10.6 Consumption Semantics

- derived results are single-use (consume-once),
- expired derived results MUST be discarded,
- on invalid or expired derived result, host MUST fall back to normal backend tool call,
- iframe SHOULD NOT re-render if receiving duplicate result (idempotency),
- iframe SHOULD preserve local state (loading flags, focus) across result injections.

### 10.7 Error Semantics

Host and UI MUST use MCP-native `isError` semantics as authoritative state:

```json
{
  "error": {
    "message": "Validation failed",
    "code": "SCHEMA_MISMATCH"
  },
  "_meta": {
    "timestamp": "2026-02-15T12:00:00Z",
    "toolId": "search_restaurants",
    "mcpletType": "read"
  }
}
```

On error derived result, iframe SHOULD:
- Display error message to user
- Allow manual retry or fallback action
- Log error for debugging

### 10.8 Lifecycle Events

Host SHOULD emit these events to fullscreen iframe:

| Event | When | Payload |
|-------|------|---------|
| `tool-result-update` | Model-derived result ready | `{ toolId, result, timestamp }` |
| `tool-result-expired` | Previous derived result expired | `{ toolId, expirationTime }` |
| `tool-invoking` | Tool being invoked (real execution) | `{ toolId, inputSchema }` |
| `tool-error` | Tool execution error | `{ toolId, error, code }` |

### 10.9 Chain Calls

v202602-08 defines single-layer derived injection only. Multi-hop derived chains are not standardized.

**Future consideration**: Multi-layer chains (LLM -> derived result -> iframe -> new LLM context) may be standardized in v202603+.

---

## 11. Display Mode

### 11.1 Modes

Concrete modes:

- `inline`
- `fullscreen`
- `pip`

LLM-decided extension modes:

- `llm-inline`
- `llm-fullscreen`
- `llm-pip`

### 11.2 Resolution Priority

Host MUST resolve final concrete mode in this order:

1. tool metadata concrete mode (`inline/fullscreen/pip`)
2. tool metadata `llm-*` mode with valid LLM suggestion
3. tool metadata `llm-*` fallback mode
4. host config/tool default mode (compatibility source allowed)
5. hard fallback: `fullscreen`

### 11.3 Mapping

Final resolved mode MUST map to MCP Apps host display mode value (`inline/fullscreen/pip`).

---

## 12. Chat Mode Profile

### 12.1 Storage and Validation

If persisted in local storage/config, host MUST validate against the supported enum set and fall back to safe default on invalid values.

### 12.2 Tool-only Enforcement

In `tool-only` mode, host MUST:

- reject responses without tool calls,
- reject disallowed tool calls,
- provide user-facing recovery/refusal text.

---

## 13. State and Data Flow

### 13.1 Stateless MCPlet Principle

MCPlets MUST remain stateless between invocations.

### 13.2 Host Responsibilities

Host is responsible for:

- conversation state,
- invocation history,
- parameter carry-forward between tools,
- policy enforcement,
- UI data hydration and updates.

### 13.3 Inter-tool Coordination

Direct tool-to-tool hidden state sharing is prohibited. Coordination occurs through explicit host mediation.

---

## 14. UI Integration via MCP Apps

### 14.1 Optionality

UI is optional. Every MCPlet must have a non-UI invocation path.

### 14.2 Lifecycle

UI lifecycle follows MCP Apps. MCPlet does not define alternate lifecycle event names.

### 14.3 Data Binding

Host SHOULD provide input/result data through MCP Apps app handlers (for example tool input/result notifications).

### 14.4 iframe Synchronization with Derived Tool Result Channel

**Fullscreen iframe tools** (displayMode: `fullscreen` or `llm-fullscreen`) MAY receive automatic updates from the Derived Tool Result Channel without requiring explicit user tool invocation:

#### When Synchronization Occurs

1. **LLM Response**: LLM generates text response in chat
2. **Derived Result Creation**: Host extracts structured data and creates derived result matching tool schema
3. **Channel Injection**: Host injects result into Derived Tool Result Channel
4. **iframe Update**: Fullscreen iframe receives update via MCP Apps bridge and re-renders

#### iframe Responsibilities

Fullscreen iframe tools MUST:

- Listen for `tool-result-update` events from host via MCP Apps window messaging
- Validate result timestamp and TTL before applying update
- Preserve iframe state (scroll, focus, form data) during synchronization
- Handle schema validation gracefully (log errors, allow fallback)
- Emit `result-consumed` event back to host for tracking

#### Host Responsibilities

Host MUST:

- Validate derived result against target tool's schema before injection
- Enforce TTL (recommended: 30 seconds) to prevent stale UI
- Route derived results only to whitelisted tools
- Provide clear error feedback if injection fails
- Support bidirectional communication (host -> iframe, iframe -> host)

#### Example Implementation Flow

```
User Chat Message
  |
  v
LLM Processes (visibility: ['model'] tools)
  |
  v
LLM Generates Text Response
  |
  v
Host Extracts Structured Data from Response
  |
  v
Host Creates Derived Result (matches search_restaurants schema)
  |
  v
Host Validates Against Schema URI
  |
  v
Host Injects via Derived Tool Result Channel
  |
  v
Fullscreen iframe Receives Message Event
  |
  v
iframe Validates Timestamp & Schema
  |
  v
iframe Updates State (setRestaurants())
  |
  v
iframe Re-renders with Synchronized Content
  |
  v
Content is in sync with LLM text response
```

### 14.5 Display Mode Considerations

- **`inline`**: Derived results update embedded iframe; may resize container
- **`fullscreen`**: Derived results fill entire iframe area; most suitable for result synchronization
- **`pip`**: Derived results update pip window; minimize size constraints
- **`llm-inline` / `llm-fullscreen` / `llm-pip`**: LLM may suggest display mode AND drive result synchronization

---

## 15. Fallback and Progressive Enhancement

Every MCPlet SHOULD define deterministic text fallback behavior suitable for hosts without MCP Apps UI support.

Hosts MAY downgrade rendering capability without breaking functional tool execution.

---

## 16. Security Baseline

### 16.1 Required Security Controls

Implementations MUST apply at least:

- explicit visibility enforcement,
- `mcpletType` declaration and enforcement (host MUST reject tools without declared `mcpletType`),
- strict schema-based payload validation for derived injection,
- TTL + payload size limits,
- no hidden side effects beyond declared `mcpletType`,
- CSP policy for UI resources.

### 16.2 Recommended Controls

- rate limiting for local injection pathways,
- audit logging for `action` type tool calls,
- domain allowlists for UI resource connectivity,
- host validation that `action` tools with model visibility have enforced authentication.

---

## 17. Conformance

### 17.1 A host/server pair claiming MCPlet v202603-01 conformance MUST satisfy:

1. `mcpletType` declaration on all tools and host enforcement,
2. visibility filtering and enforcement,
3. code-first metadata precedence,
4. display mode resolution rules,
5. MCP Apps lifecycle compatibility,
6. stateless MCPlet execution model,
7. `action` + model-visible tools MUST have authentication enforcement.

Derived-result channel is optional; if implemented, Section 9 becomes mandatory.

---

## 18. Intellectual Property Notice

The editors are aware that certain aspects of this specification may be covered by pending patent applications, including:

- **Japanese Patent Application No. 2026-026931**  
  Title: *Inference Result Injection Control Device, Method, and Program*

The patent holder intends to make any essential patent claims available under terms consistent with widely accepted open standards policies.

If this specification progresses toward formal standardization, the patent holder expects to provide licensing commitments consistent with recognized industry practices, which may include Royalty-Free (RF) or Fair, Reasonable, and Non-Discriminatory (FRAND) terms depending on the requirements of the applicable standards organization.

This notice is provided for transparency and does not impose licensing requirements on implementations of this draft specification.

---

## 19. Versioning

Specification version format remains `vYYYYMM-REV`.

### Version History

- `v202603-01`: Added Section 18 (Intellectual Property Notice) documenting pending patent application disclosure and anticipated standards-aligned licensing commitment principles (including potential RF/FRAND frameworks), with explicit transparency statement for draft implementations.
- `v202602-08`: Formalized `_meta.mcpletType` field. Key changes: (1) Added `_meta.mcpletType` as a MUST-declare field in tool registration, resolving the gap between Section 4 (classification rules) and Sections 5-6 (metadata contracts) -- `mcpletType` is now part of the `_meta` structure alongside `ui` and `auth`; (2) Added Section 4.1 with code example for `mcpletType` declaration; (3) Added Section 4.2 documenting recommended combinations of `mcpletType` x `visibility` x `auth`, including safety rules for `action` tools exposed to model; (4) Updated Section 5.1 to include `_meta.mcpletType` in MUST-provide list and `_meta.auth` in SHOULD-provide list; (5) Renamed Section 6 from "Tool Metadata Contract (`_meta.ui`)" to "Tool Metadata Contract (`_meta`)" to reflect full `_meta` scope including `mcpletType`, `ui`, and `auth`; (6) Added Section 6.1 (`mcpletType`) and Section 6.6 (`auth`) field definitions; (7) Updated all JSON examples and code samples to include `mcpletType`; (8) Updated Sections 8.3, 7.6, 9.1, 10.7, 16.1, 16.2, 17.1 to use formal `mcpletType` references instead of informal terms like "write/sensitive" and "read-only"; (9) Added `mcpletType` to result envelope `_meta` (Section 9.1) for downstream AI reasoning.
- `v202602-07`: Corrected Passkey authentication specification to align with reference implementation. Key changes: (1) Fixed `auth` field location to `_meta.auth` (not top-level); (2) Corrected authentication workflow -- registration alone does NOT authorize tool invocation, authentication MUST always follow; (3) Added Phase 2 (User ID Resolution) and renumbered workflow phases; (4) Added Section 7.4 documenting Relying Party ID (`rpId`) determination rules; (5) Added Section 7.5 documenting how to enable/disable Passkey at global, per-tool, and per-operation levels; (6) Clarified "session" terminology to distinguish FIDO2 ceremony sessions from persistent login sessions; (7) Updated code examples to match actual `registerAppTool` function signature from `@modelcontextprotocol/ext-apps/server`.
- `v202602-06`: Added Tool Authentication Contract (`_meta.auth`) with Passkey/FIDO2 authentication support, including workflow phases, implementation approaches, security considerations, and testing guidance.
- `v202602-05`: Code-first primary profile; formalized visibility triad, schema URI versioning, derived-result safety, and display/chat mode rules aligned with reference implementation.
- `v202602-03`: MCP Apps App SDK lifecycle alignment.
- `v202602-02`: state management + output schema requirements.
- `v202602-01`: initial draft.

---

## Appendix A: Migration Notes from v202602-03

1. `mcplet.yaml` changed from required core artifact to optional compatibility config.
2. `_meta.ui.visibility` is now the normative invocation boundary.
3. `displayMode` now supports `llm-*` extension with deterministic fallback.
4. Tool-result schema URI versioning is formalized.
5. Derived-result channel is explicitly standardized with validation/TTL/size/revision controls.
6. Chat mode profile is formalized (`free/guided/tool-only`) with enforcement rules.

---

## Appendix B: Migration Notes from v202602-06

1. `auth` field MUST be inside `_meta` (as `_meta.auth`), not at the top level of tool config.
2. Passkey workflow now has 5 phases (was 4); Phase 2 (User ID Resolution) is new; old Phase 2 (Registration) now explicitly states authentication MUST follow.
3. New Section 7.4 (`rpId`) -- implementations relying on custom `rpId` should review.
4. New Section 7.5 (Enable/Disable) -- documents three levels of Passkey control.

---

## Appendix C: Migration Notes from v202602-07

1. `_meta.mcpletType` is now a MUST-declare field. Existing tools MUST add `mcpletType: 'read' | 'prepare' | 'action'` to their `_meta` at registration time.
2. `_meta.auth` added to SHOULD-provide list in Section 5.1 -- `action` type tools SHOULD declare `_meta.auth`.
3. Section 6 expanded from `_meta.ui` scope to full `_meta` scope. New subsections: 6.1 (`mcpletType`), 6.6 (`auth`).
4. New Section 4.2 defines recommended mcpletType x visibility x auth combinations. Key safety rule: `action` tools with model visibility MUST have authentication enforcement.
5. Result envelope `_meta` (Section 9.1) now includes `mcpletType` for downstream reasoning.
6. Conformance (Section 17) now requires `mcpletType` declaration and `action` + model-visible authentication enforcement.

---

## Appendix D: Reference Implementation Mapping (Informative)

This version is informed by:

- `reference_impl_restaurant_reservations/mcpapps/mcp-server/index.ts` - Tool server (verified stable with v202602-07; pending `mcpletType` addition for v202602-08)
- `reference_impl_restaurant_reservations/mcpapps/chat/main.ts` - Chat client integration
- `reference_impl_restaurant_reservations/mcpapps/mcplet/mcplet-lib-chat.js` - Chat protocol library
- `reference_impl_restaurant_reservations/mcpapps/mcplet/mcplet-lib-server.js` - Server protocol library (MCPlet wrapper)
- `reference_impl_restaurant_reservations/mcpapps/mcplet/mcplet-lib-passkey.js` - Passkey/FIDO2 authentication SDK (implements section 7 patterns)
- `reference_impl_restaurant_reservations/mcpapps/mcplet/dfido2-lib.js` - amiPro FIDO2 SDK (low-level WebAuthn operations, rpId handling)
- `reference_impl_restaurant_reservations/mcpapps/mcp-client/src/passkey.ts` - App-layer authentication helper (`ensurePasskeyForSensitiveAction`)
- `reference_impl_restaurant_reservations/mcpapps/mcp-client/src/apps/SearchApp.tsx` - App-layer authentication pattern; race condition guard implementation
- `reference_impl_restaurant_reservations/mcpapps/mcp-client/src/apps/ReservationsApp.tsx` - App-layer authentication pattern applied to sensitive action tools

**Section 7 (Passkey Authentication) Mapping**:

- `mcplet-lib-passkey.js` implements the `PasskeyAuth` module and `PasskeyAuthHelper` class (7.1.2)
- `dfido2-lib.js` implements low-level FIDO2/WebAuthn operations including `rpId` handling (7.4)
- `passkey.ts` implements the `ensurePasskeyForSensitiveAction()` pattern matching the workflow phases (7.2)
- `SearchApp.tsx` and `ReservationsApp.tsx` demonstrate the app-layer integration pattern calling `ensurePasskeyForSensitiveAction()` before sensitive tool invocations
- `mcp-server/index.ts` demonstrates `_meta.auth` declaration on `create_reservation` and `cancel_reservation` tools (7.1.1, 7.3)

These files are informative examples, not normative by themselves.

---

**End of MCPlet Specification v202603-01**
