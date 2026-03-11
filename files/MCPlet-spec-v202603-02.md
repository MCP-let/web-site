# MCPlet Specification v202603-02

> **Status**: Draft  
> **Date**: 2026-03-09  
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

MCPlets are stateless units. Conversation state, cross-tool context, and UI data flow are managed by the host. For authenticated actions, the MCPlet backend remains stateless by relying on synchronous verification against a dedicated Passkey server.

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
- holds conversation state,
- intercepts and injects backend-enforced authentication payloads.

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

- `action` tools with `visibility` containing `'model'` MUST have Passkey authentication with backend enforcement (`auth.enforcement: 'strict'`) or equivalent host interception to prevent unconfirmed side effects.
- `read` tools SHOULD NOT require Passkey authentication.
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

`mcplet.yaml` MAY be used as a backward-compatibility source for host defaults, but MUST NOT be the single source of truth when code metadata is present.

---

## 6. Tool Metadata Contract (`_meta`)

The following fields are defined for MCPlet profile under `_meta`:

```json
{
  "_meta": {
    "mcpletType": "action",
    "ui": {
      "resourceUri": "ui://restaurant/search-app.html",
      "visibility": ["model", "app"],
      "displayMode": "inline",
      "mcpletToolResultSchemaUri": "mcplet://tool-result-schema/search_restaurants"
    },
    "auth": {
      "required": "passkey",
      "enforcement": "strict",
      "promptMessage": "Please authenticate with Passkey to confirm"
    }
  }
}
```

### 6.1 `mcpletType`

MCPlet classification type. MUST be one of: `"read"`, `"prepare"`, `"action"`.

### 6.2 - 6.5 UI Configurations

*(Unchanged from v202603-01: resourceUri, visibility, displayMode, mcpletToolResultSchemaUri)*

### 6.6 `auth`

Authentication requirements for this tool. See Section 7 for full specification.

- `auth.required`: Authentication type (e.g., `'passkey'`).
- `auth.enforcement`: Level of validation required. 
  - `'strict'` (Recommended for actions): Backend server MUST verify the WebAuthn signature. Host MUST intercept and inject credentials.
  - `'host-only'`: Validation is trusted solely on the Host side.
- `auth.promptMessage`: Message displayed to user during authentication prompt.

---

## 7. Passkey Authentication & Backend Enforcement

MCPlet provides built-in Passkey support integrated with a backend-enforcement architecture to prevent malicious hosts from bypassing frontend validation.

### 7.1 Passkey Authentication Implementation

#### 7.1.1 Tool Metadata Declaration

Tools requiring verified execution MUST declare `_meta.auth`:

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
      ui: { visibility: ['model', 'app'] },
      auth: {
        required: 'passkey',
        enforcement: 'strict', // Requires Backend Verification
        promptMessage: 'Please authenticate with Passkey to confirm your reservation'
      }
    }
  },
  handler
);
```

#### 7.1.2 Stateless Backend Verification Principle

To comply with the stateless MCPlet principle, the MCP server itself DOES NOT store Passkey challenges or session state. Instead:
1. The Host retrieves a challenge from the external FIDO2 Server (e.g., amiPro Passkey Server).
2. The Host performs the WebAuthn signature ceremony.
3. The Host injects the minimal raw assertion payload into the tool call.
4. The MCPlet backend proxies that payload to the FIDO2 Server for synchronous validation before executing the business logic.

### 7.2 Passkey Workflow & Host Interception

For tools with `auth.enforcement: 'strict'`, the workflow operates in the following phases:

#### Phase 1: Availability Check & User ID Resolution
Host verifies WebAuthn support, FIDO2 SDK readiness, and determines user identity.

#### Phase 2: Interception (LLM Request Paused)
When the LLM decides to call a protected tool, the Host MUST intercept the tool execution. The Host MUST NOT send the request to the MCP server yet.

#### Phase 3: Registration (First-Time User)
If no passkey exists, host prompts for registration via the FIDO2 server. (Registration alone does NOT authorize tool access).

#### Phase 4: Authentication Ceremony
1. Host fetches an assertion challenge from the FIDO2 server.
2. Host prompts user (using `auth.promptMessage`).
3. User confirms with authenticator.
4. Host collects the minimal WebAuthn assertion payload required for backend verification (typically `credentialId`, `clientDataJSON`, `authenticatorData`, and `signature`).

#### Phase 5: Credential Injection (LLM Invisible)
Host injects the assertion payload into the JSON-RPC `params._meta` object. This ensures the LLM's `inputSchema` remains purely focused on business logic and prevents hallucination of cryptographic parameters.

#### Phase 6: Backend Verification & Invocation
1. Host resumes tool invocation, sending the modified JSON-RPC payload to the MCPlet server.
2. The MCPlet server extracts `params._meta.mcplet_verification`.
3. The MCPlet server synchronously calls the FIDO2 server to verify the assertion using the supplied verification payload.
4. Upon successful verification, the tool executes. If verification fails, the server returns an MCP Error.

### 7.3 Tool Authentication Contract (`params._meta.mcplet_verification`)

`params._meta.mcplet_verification` is an MCPlet profile-specific extension field used to carry verification context for protected tool calls. It does not redefine MCP transport, JSON-RPC semantics, or the base `tools/call` contract.

For `auth.enforcement: 'strict'`, `params._meta.mcplet_verification` MUST contain sufficient raw assertion material for independent backend verification. A typical minimal payload includes `credentialId`, `clientDataJSON`, `authenticatorData`, and `signature`. Fields such as `challenge` or `userHandle` MAY be omitted when they are derivable from `clientDataJSON` or not required by the verification backend.

#### 7.3.1 Parameter Isolation via `params._meta`

The Host MUST NOT place WebAuthn data in the standard tool `arguments`. It MUST be appended as an extension inside `params._meta.mcplet_verification` during the `tools/call` JSON-RPC request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "create_reservation",
    "arguments": { 
      "date": "2026-04-01", 
      "guests": 2 
    },
    "_meta": {
      "mcplet_verification": {
        "type": "passkey_assertion",
        "credentialId": "...",
        "clientDataJSON": "...",
        "authenticatorData": "...",
        "signature": "..."
      }
    }
  }
}
```

#### 7.3.2 Passkey Server API Requirements (Informative)

To support this stateless backend enforcement, the underlying FIDO2 Server (e.g., based on `fido2-node-ex`) MUST provide functionality to:
- Generate and temporarily store short-lived (e.g., TTL < 60s) assertion challenges.
- Expose a server-to-server verification endpoint (`/auth/verify-assertion`) allowing the MCPlet backend to submit the `mcplet_verification` payload and receive a definitive boolean trust decision based on the raw assertion material.

### 7.4 Security Considerations & Negative Factors

#### Architecture Trade-offs
- **Service Dependency**: Backend verification creates a hard runtime dependency on the Passkey Server. If the FIDO2 server is unreachable, all `strict` action tools will fail gracefully but remain inoperable.
- **Latency**: The double-roundtrip (Challenge Fetch -> Signature -> Tool Call -> Backend Verify) increases response times. Hosts MUST utilize optimistic UI loading states.
- **Protocol strictness**: Tools relying on `params._meta.mcplet_verification` will fail if invoked by standard MCP clients that lack MCPlet-specific interception capabilities.

#### Relying Party ID (`rpId`)
The `rpId` must be correctly configured across the Host, the MCPlet Backend, and the FIDO2 Server to prevent domain mismatch during backend validation. 

*(Remaining Passkey sections 7.5 - 7.8 from v202603-01 remain conceptually unchanged but should adapt to the injected meta context.)*

---

## 8. Tool Visibility
*(Unchanged)*

## 9. Tool Result Envelope and Schema Resources
*(Unchanged)*

## 10. Derived Tool Result Channel
*(Unchanged)*

## 11. Display Mode
*(Unchanged)*

## 12. Chat Mode Profile
*(Unchanged)*

## 13. State and Data Flow
*(Unchanged)*

## 14. UI Integration via MCP Apps
*(Unchanged)*

## 15. Fallback and Progressive Enhancement
*(Unchanged)*

## 16. Security Baseline

### 16.1 Required Security Controls

Implementations MUST apply at least:

- explicit visibility enforcement,
- `mcpletType` declaration and enforcement (host MUST reject tools without declared `mcpletType`),
- **Backend-enforced authentication** (`auth.enforcement: 'strict'`) for `action` type tools exposed to the model, utilizing injected `params._meta` credentials,
- strict schema-based payload validation for derived injection,
- TTL + payload size limits,
- no hidden side effects beyond declared `mcpletType`,
- CSP policy for UI resources.

### 16.2 Recommended Controls
*(Unchanged)*

---

## 17. Conformance
*(Unchanged)*

## 18. Intellectual Property Notice
*(Unchanged)*

---

## 19. Versioning

Specification version format remains `vYYYYMM-REV`.

### Version History

- **`v202603-02`**: Introduced **Backend Enforcement** architecture for Passkey authentication. 
  - Added `auth.enforcement` configuration in `_meta`.
  - Defined the **Host Interception** phase, ensuring WebAuthn payloads are injected securely into the JSON-RPC `params._meta.mcplet_verification` extension rather than tool `arguments`, eliminating LLM parameter hallucination.
  - Refined the stateless verification principle (Section 7.1.2) explicitly requiring synchronous backend checks against the FIDO2 server.
- `v202603-01`: Added Section 18 (Intellectual Property Notice).
- `v202602-08`: Formalized `_meta.mcpletType` field. 
- `v202602-07`: Corrected Passkey authentication specification to align with reference implementation.
- `v202602-06`: Added Tool Authentication Contract (`_meta.auth`).
- `v202602-05`: Code-first primary profile.
- `v202602-03`: MCP Apps App SDK lifecycle alignment.
- `v202602-02`: state management + output schema requirements.
- `v202602-01`: initial draft.

---
**End of MCPlet Specification v202603-02**
