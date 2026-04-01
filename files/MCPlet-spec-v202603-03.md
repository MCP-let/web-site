# MCPlet Specification v202603-03

> **Status**: Draft
> **Date**: 2026-03-27
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

MCPlet supports two Host implementation profiles:

- **WebUI Profile**: Host is an MCP client/agent shell with UI rendering capabilities (MCP Apps).
- **Agent Profile**: Host is an agent orchestration layer composed of specialized agents and an externally injected LLM, with no required UI layer.

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
- MCP Apps Extension Specification (applicable to WebUI Profile only)
- RFC 2119 / RFC 8174 — The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

Where UI rendering, iframe lifecycle, app-bridge events, or host-view communication are concerned, MCP Apps is authoritative and applies only to the WebUI Profile.

---

## 2. Design Principles

### 2.1 Code-First (Primary)

MCPlet adopts a **Code-First** model (introduced in v202602-08):

- tool metadata is declared at registration time,
- tool result schema is exposed as MCP Resources,
- visibility is expressed in tool `_meta.visibility` (both profiles); display mode is expressed in `_meta.ui.displayMode` (WebUI Profile only).

`mcplet.yaml` is no longer required for core runtime behavior.

### 2.2 Security Boundaries by Visibility

Tool Visibility is the primary boundary between what an LLM can invoke and what must remain app-triggered with user interaction. In Agent Profile, visibility enforcement is the responsibility of the Host's agent orchestration layer.

### 2.3 Host-Orchestrated State

MCPlets are stateless units. Conversation state, cross-tool context, and UI data flow are managed by the host. For authenticated actions, the MCPlet backend remains stateless by relying on synchronous verification against a dedicated Passkey server.

### 2.4 Progressive Enhancement

All MCPlets must remain usable in text-only (agent-invocable) mode. UI is optional enhancement applicable only to the WebUI Profile.

### 2.5 LLM Agnosticism (Agent Profile)

In the Agent Profile, the Host integrates with an externally provided LLM. The MCPlet layer and MCPlet Pool are LLM-agnostic; LLM selection and configuration are Host responsibilities.

---

## 3. Core Concepts

### 3.1 MCPlet

A smallest reviewable AI-operable unit representing exactly one intent.

### 3.2 Intent

Human-readable purpose independent from UI or transport.

### 3.3 Host

The orchestration layer that manages agents, tool discovery, policy enforcement, and state. Host implementation varies by profile:

**WebUI Profile Host** — an MCP client/agent shell that:
- discovers tools/resources,
- invokes tools,
- renders MCP Apps UI,
- enforces policy (visibility, mode, safety),
- holds conversation state,
- intercepts and injects backend-enforced authentication payloads.

**Agent Profile Host** — an agent orchestration system that:
- composes one or more specialized Agents (e.g., information-gathering agent, planning agent, action-dispatch agent),
- integrates with an externally configured LLM,
- discovers and routes tool invocations to the MCPlet layer (directly or via a MCPlet Pool),
- enforces policy (visibility, mcpletType, safety) at the agent orchestration layer,
- holds conversation and cross-agent context,
- intercepts and injects backend-enforced authentication payloads,
- provides an **A2A local protocol** bus for internal inter-agent communication,
- exposes an **A2A protocol** endpoint at the Host boundary for External Agent connections,
- MAY expose a **Dashboard** for operator visibility, audit review, and manual host control,
- serves a **Passkey Web Page** to fulfill WebAuthn ceremony requirements when authenticating action-type tool calls,
- does NOT require a general-purpose UI rendering layer.

A Host MUST implement exactly one profile. Mixed-profile Hosts are not defined by this specification.

### 3.4 Agent (Agent Profile)

A specialized autonomous unit within the Agent Profile Host, responsible for a scoped domain of tasks. Agents invoke MCPlets via the MCP tool protocol. Agent types and their roles are open for extension by the Host implementation; this specification does not mandate a fixed set of agent roles.

Each Agent carries an **accessible Pool list** — an explicit set of Pool names the agent is permitted to invoke. The Host MUST enforce this list at dispatch time:

- An agent with an accessible Pool list `["pool-a", "pool-b"]` may only invoke MCPlets belonging to `pool-a` or `pool-b`, plus MCPlets that declare no Pool membership.
- An agent with an empty or absent accessible Pool list may only invoke MCPlets that declare no Pool membership.
- Pool access grants are declared in Host configuration, not in the MCPlet itself.

This design serves two purposes: it improves dispatch efficiency (the Host can narrow tool discovery to relevant Pools) and enforces least-privilege access (an agent cannot reach MCPlets in Pools it was not granted).

#### Inter-Agent Communication (A2A Local Protocol)

Agents within the Agent Profile Host communicate with each other via the **A2A local protocol** — an in-process or loopback variant of the Agent-to-Agent (A2A) protocol. It provides structured task delegation, agent capability discovery, and a uniform message envelope independent of agent implementation.

The A2A local protocol is confined to the Host process boundary. Local A2A messages MUST NOT be routable to systems outside the Host. It is distinct from the external A2A protocol endpoint exposed at the Host boundary for External Agents (see Section 3.6).

When agents communicate in-process (e.g., direct function calls within a single runtime), the A2A local protocol contract MAY be satisfied by typed interfaces or method signatures rather than serialized JSON. The JSON payload format defined in Section 18 becomes mandatory only when messages are serialized — for tracing, persistence, testing, replay, or cross-runtime coordination.

#### Director Agent

The **Director Agent** is a built-in Agent type in the Agent Profile. It is triggered by a timer or cron schedule rather than by a human request or upstream agent. Upon trigger, it:

1. Loads a configurable prompt template (defined in Host configuration).
2. Invokes the Host-configured LLM with that prompt to produce a task instruction.
3. Dispatches the resulting instruction to the appropriate agents or MCPlets within its accessible Pool list.

The Director Agent MUST respect the same Pool access controls and `mcpletType` enforcement as any other agent. The prompt template and schedule are Host-managed configuration; they are not part of the MCPlet tool contract.

**Failure handling**: If the LLM invocation fails (e.g., network error, rate limit, timeout), the Director Agent MUST NOT retry indefinitely; the Host SHOULD define a maximum retry count and a backoff interval in configuration. If the LLM output cannot be parsed into a valid task instruction, the Director Agent MUST log the failure and skip the current trigger cycle without dispatching. If a previous Director Agent cycle is still in progress when the next trigger fires, the Host MUST either queue or skip the new trigger; concurrent execution of the same Director Agent schedule MUST NOT occur.

Agents are Host-internal components and are not exposed as MCP tools themselves.

### 3.5 MCPlet Pool

A **MCPlet Pool** is a named, managed collection of MCPlets that share a common access pattern, external target domain, or policy scope. A Pool:

- groups MCPlets that access a common category of external systems (e.g., external web services, external APIs),
- allows the Host to selectively load, activate, or restrict a subset of MCPlets,
- may apply shared policy defaults (e.g., rate limiting, domain allowlists) to all members without relaxing stricter per-MCPlet requirements,
- is transparent to the MCP protocol — members are individually registered tools; the Pool is a Host-side organizational construct.

A Pool is identified by a name (e.g., `media-pool`, `info-pool`). MCPlets declare Pool membership via `_meta.pool` (optional, single string value). A MCPlet belongs to at most one Pool. Multi-Pool membership is intentionally excluded to keep dispatch routing unambiguous and audit trails simple; Hosts that need overlapping access patterns SHOULD model them through agent-level Pool grants rather than MCPlet-level multi-membership. MCPlets not declaring `_meta.pool` are pool-less and are accessible to any agent that is otherwise allowed to dispatch MCPlets, including agents with no Pool grants.

**Example named Pools:**

| Pool name | Example members | Access pattern |
| --- | --- | --- |
| `media-pool` | site-access MCPlet, email MCPlet, SNS MCPlet | media channel read/write |
| `info-pool` | external-web MCPlet, external-API MCPlet | external information retrieval |
| *(none)* | CRM MCPlet, ERP MCPlet, HR MCPlet | internal systems, no Pool restriction |

**Example `_meta.pool` declaration:**
```typescript
_meta: {
  mcpletType: 'read',
  pool: 'info-pool',         // Pool membership (optional)
  visibility: ['model'],     // Top-level: applies to both profiles
  ui: {
  }
}
```

A MCPlet not declaring `_meta.pool` belongs to no Pool. It remains accessible to any agent permitted to dispatch pool-less MCPlets, including agents whose accessible Pool list is empty or absent.

### 3.6 External Agent

An **External Agent** is an agent that operates outside the MCPlet Host boundary and connects to the Host via the **A2A protocol** — the externally exposed endpoint of the Host. External Agents:

- are not Host-internal components and are not managed by the Host's internal orchestration,
- connect to the Host through the A2A protocol endpoint (not via the A2A local protocol bus),
- are granted an accessible Pool list by the Host, using the same mechanism as internal agents,
- MUST authenticate to the Host before any task delegation or tool dispatch is permitted,
- are subject to the same per-agent Pool access enforcement as internal agents.

The Host MUST treat External Agents with no greater privilege than an internal agent holding equivalent Pool access grants. An External Agent MUST NOT be able to invoke MCPlets beyond its granted Pool list, regardless of the A2A task payload it sends.

When the Host exposes a machine-readable A2A endpoint for External Agents, the request and response payloads MUST follow the A2A contract defined in Section 18.

### 3.7 Passkey Web Page (Agent Profile)

The **Passkey Web Page** is a Host-served, purpose-built web page that provides the browser context required to execute a WebAuthn ceremony. It is a mandatory component of the Agent Profile Host when any MCPlet with `auth.required: 'passkey'` is registered.

**Purpose**: The WebAuthn API (`navigator.credentials.get()`) is a browser API and cannot be called from an agent process directly. The Passkey Web Page bridges this gap by running the ceremony in a real browser context and returning the resulting assertion to the Host via a secure local channel.

**Lifecycle**:

1. The Host intercepts an `action`-type tool call requiring Passkey authentication (Section 7.2 Phase 2).
2. The Host opens the Passkey Web Page in a system browser or embedded webview.
3. The Passkey Web Page fetches an assertion challenge from the FIDO2 Server.
4. The page presents the WebAuthn prompt to the user (`auth.promptMessage` is passed as a query parameter or via postMessage).
5. Upon successful user confirmation, the page collects the WebAuthn assertion payload and posts it back to the Host via a deployment-appropriate secure callback channel.
6. The Host receives the assertion, injects it into `params._meta.mcplet_auth` (Section 7.3.1), and closes the page.
7. The tool call resumes with the injected credentials.

**Requirements**:

- The Passkey Web Page MUST be served from either a loopback-only `localhost` origin or a Host-controlled HTTPS origin, and the selected origin MUST match the configured `rpId`.
- The page MUST be minimal and purpose-built; it MUST NOT expose any MCPlet tool invocation or agent orchestration capabilities.
- The callback channel MUST be deployment-appropriate and Host-controlled: in localhost mode it MUST use a loopback-only callback endpoint or IPC channel, and in HTTPS mode it MUST use a same-origin HTTPS callback or an equivalent Host-controlled secure return channel.
- The callback channel MUST NOT accept callbacks from origins other than the selected Passkey Web Page origin.
- The page MUST close automatically upon successful assertion delivery or upon timeout. Timeout duration SHOULD match the challenge TTL (e.g., < 60 seconds).
- If the user cancels or the ceremony fails, the Host MUST return an MCP Error for the tool call and MUST NOT proceed with execution.

---

## 4. MCPlet Classification

Each MCPlet tool contract MUST declare one `mcpletType` via the `_meta.mcpletType` field:

- `read`: side-effect free, idempotent, safe for autonomous model invocation.
- `prepare`: gathers/validates data; no irreversible side effects. The Host MAY invoke `prepare` tools autonomously (like `read`) but SHOULD present the gathered data to the user or downstream agent before proceeding to an `action` tool that depends on it. `prepare` tools serve as explicit checkpoints in multi-step workflows.
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
      visibility: ['model'],
      ui: {
        resourceUri: SEARCH_RESOURCE_URI,
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
| `action` | `['model']` | MUST NOT | Dangerous: model could invoke side-effects autonomously; this combination is prohibited |
| `action` | `['model','app']` | MUST (if model-visible) | If exposed to model, auth interception is mandatory |

**Key rules**:

- `action` tools with `visibility` containing `'model'` MUST have Passkey authentication with backend enforcement (`auth.enforcement: 'strict'`) or equivalent host interception to prevent unconfirmed side effects.
- `read` tools SHOULD NOT require Passkey authentication.
- Host MUST validate that `action` tools are not exposed to model without appropriate safeguards.
- In Agent Profile, the Host-controlled action-dispatch path acts as the confirmation authority for `action`-type tools in place of UI confirmation. Many implementations realize this path with a dedicated Action-Dispatch Agent, but that role name is not mandatory.

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
- `_meta.visibility`

It SHOULD provide:

- `_meta.mcpletToolResultSchemaUri`
- `_meta.ui.resourceUri` (WebUI Profile only)
- `_meta.ui.displayMode` (WebUI Profile only)
- `_meta.auth` (SHOULD for `action` type tools)
- `_meta.pool` (SHOULD for MCPlets belonging to a Pool)

### 5.2 Compatibility Profile: YAML-based Configuration

`mcplet.yaml` MAY be used as a backward-compatibility source for host defaults, but MUST NOT be the single source of truth when code metadata is present.

### 5.3 MCPlet Discovery, Registration, and Pool Configuration

MCPlet discovery and registration builds on top of the standard MCP protocol's `tools/list` and `resources/list` lifecycle. This section specifies how a Host discovers MCPlet-compliant tools and how Pool membership is resolved.

#### 5.3.1 Discovery via MCP `tools/list`

The Host discovers MCPlets by issuing a standard MCP `tools/list` request during the connection initialization phase. Each tool in the response that includes `_meta.mcpletType` is recognized as a MCPlet-compliant tool.

The Host MUST inspect the returned tool definitions and MUST reject (exclude from routing) any tool that:

- does not declare `_meta.mcpletType`, or
- declares a `mcpletType` value outside the defined set (`read`, `prepare`, `action`), or
- declares `_meta.visibility` containing `'model'` for an `action`-type tool without `_meta.auth`.

#### 5.3.2 Dynamic Registration via `notifications/tools/list_changed`

When an MCP server supports `listChanged` capability, the Host MUST subscribe to `notifications/tools/list_changed`. Upon receiving this notification:

1. The Host MUST re-issue `tools/list` to obtain the updated tool set.
2. Newly appeared MCPlet tools MUST be validated against the same rules as initial discovery (Section 5.3.1).
3. Removed tools MUST be immediately evicted from all routing tables and agent tool sets.
4. Updated tools (same `name`, changed `_meta`) MUST be re-validated and re-classified.

This mechanism supports at-runtime MCPlet hot-reload without Host restart.

#### 5.3.3 Pool Configuration

Pool definitions and agent-level Pool grants are Host-side configuration, not part of the MCP protocol. The Host MUST maintain:

- A **Pool registry**: a mapping from Pool name to Pool-level policy (e.g., rate limits, domain allowlists). Pools referenced in `_meta.pool` but not present in the registry SHOULD be logged as warnings; the Host MAY reject the MCPlet or treat it as pool-less.
- An **Agent Pool grant table**: a mapping from agent ID (or External Agent ID) to the list of Pool names the agent is authorized to access. This table is populated from Host configuration and MUST NOT be modifiable by MCPlet metadata or LLM output.

When a MCPlet declares `_meta.pool`, the Host resolves the Pool name against the Pool registry. If the Pool name is recognized, the MCPlet is classified as a member of that Pool for routing and policy purposes. If the Pool name is not recognized, the Host SHOULD treat the situation as a configuration error.

#### 5.3.4 Schema Resource Discovery

MCPlet schema resources (declared via `_meta.mcpletToolResultSchemaUri`) are discovered via the standard MCP `resources/list` and `resources/read` lifecycle. The Host SHOULD prefetch schema resources referenced by registered MCPlets during initialization to enable result validation without per-call latency.

---

## 6. Tool Metadata Contract (`_meta`)

The following fields are defined for MCPlet profile under `_meta`:

```json
{
  "_meta": {
    "mcpletType": "action",
    "pool": "external-api",
    "visibility": ["model", "app"],
    "mcpletToolResultSchemaUri": "mcplet://tool-result-schema/search_restaurants",
    "ui": {
      "resourceUri": "ui://restaurant/search-app.html",
      "displayMode": "inline"
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

### 6.2 `pool`

Optional. Pool membership identifier. A string key matching a Pool defined in Host configuration. If omitted, the MCPlet belongs to no Pool.

### 6.3 `visibility`

Array of allowed invocation surfaces. Applies to both WebUI Profile and Agent Profile. See Section 8 for enforcement rules.

- `['model']`
- `['app']`
- `['model','app']`

### 6.4 `mcpletToolResultSchemaUri`

URI to an MCP Resource containing the tool-result schema payload. Applicable to both profiles. In WebUI Profile, used for derived injection validation (Section 10). In Agent Profile, used for structured output verification by downstream consumers.

### 6.5 `ui.resourceUri`

MCP Apps UI resource URI. Applicable to WebUI Profile only.

### 6.6 `ui.displayMode`

Allowed values:

- concrete: `inline | fullscreen | pip`
- llm-decided extension: `llm-inline | llm-fullscreen | llm-pip`

Applicable to WebUI Profile only.

### 6.7 `auth`

Authentication requirements for this tool. See Section 7 for full specification.

- `auth.required`: Authentication type (e.g., `'passkey'`).
- `auth.enforcement`: Level of validation required.
  - `'strict'` (Recommended for actions): Backend server MUST verify the WebAuthn signature. Host MUST intercept and inject credentials. See Section 7.2 for detailed workflow.
  - `'host-only'`: Host performs confirmation (e.g., user prompt or agent-controlled gate) but the MCPlet backend does NOT perform independent cryptographic verification. This mode is suitable for lower-risk `prepare` tools or environments where a FIDO2 Server is not deployed. The Host MUST still intercept the tool call and obtain explicit user confirmation before proceeding, but the `params._meta.mcplet_auth` payload is not required. Backend execution proceeds after Host-level confirmation without a server-to-server verification round-trip.
- `auth.promptMessage`: Message displayed to user during authentication prompt (WebUI Profile) or logged/passed to agent orchestration (Agent Profile).

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
      visibility: ['model', 'app'],
      ui: {},
      auth: {
        required: 'passkey',
        enforcement: 'strict',
        promptMessage: 'Please authenticate with Passkey to confirm your reservation'
      }
    }
  },
  handler
);
```

#### 7.1.2 Stateless Backend Verification Principle

To comply with the stateless MCPlet principle, the MCP server itself DOES NOT store Passkey challenges or session state. Instead:

1. The challenge is retrieved from the external FIDO2 Server (e.g., amiPro Passkey Server) by the Host in WebUI Profile, or by the Passkey Web Page on the Host's behalf in Agent Profile.
2. The Host coordinates the WebAuthn signature ceremony in the appropriate browser context.
3. The Host injects the signature payload into the tool call.
4. The MCPlet backend proxies the signature to the FIDO2 Server for synchronous validation before executing the business logic.

### 7.2 Passkey Workflow & Host Interception

For tools with `auth.enforcement: 'strict'`, the workflow operates in the following phases.

For tools with `auth.enforcement: 'host-only'`, the Host MUST still intercept the tool call (Phase 2) and obtain explicit user confirmation (e.g., a UI prompt in WebUI Profile, or the agent-controlled confirmation gate in Agent Profile). However, Phases 3–4 (Passkey registration and WebAuthn ceremony) and Phase 6 backend verification are skipped. The Host proceeds directly from confirmation to tool invocation without injecting `params._meta.mcplet_auth`.

#### Phase 1: Availability Check & User ID Resolution

Host verifies WebAuthn support, FIDO2 SDK readiness, and determines user identity.

- **WebUI Profile**: checks browser WebAuthn API availability in the chat client.
- **Agent Profile**: checks that the Passkey Web Page server is running and that the configured origin / `rpId` binding is valid.

#### Phase 2: Interception (LLM Request Paused)

When the LLM decides to call a protected tool, the Host MUST intercept the tool execution. The Host MUST NOT send the request to the MCP server yet.

- **WebUI Profile**: the chat host intercepts before dispatching to the MCP server.
- **Agent Profile**: the agent responsible for action dispatch intercepts. The Host then opens the Passkey Web Page (see Section 3.7) to initiate the ceremony.

#### Phase 3: Registration (First-Time User)

If no passkey exists, host prompts for registration via the FIDO2 server. (Registration alone does NOT authorize tool access).

- **Agent Profile**: registration is performed within the Passkey Web Page browser context.

#### Phase 4: Authentication Ceremony

- **WebUI Profile**:
  1. Host fetches an assertion challenge from the FIDO2 server.
  2. Host prompts user via the chat UI (using `auth.promptMessage`).
  3. User confirms with authenticator.
  4. Host collects the WebAuthn assertion payload (signature, authenticatorData, clientDataJSON).

- **Agent Profile**:
  1. Host opens the Passkey Web Page, passing `auth.promptMessage` as a parameter.
  2. Passkey Web Page fetches the assertion challenge from the FIDO2 server.
  3. Page presents the WebAuthn prompt; user confirms with authenticator.
  4. Page collects the assertion payload and delivers it to the Host via the deployment-appropriate secure callback channel.
  5. Host receives the assertion; Passkey Web Page closes.

#### Phase 5: Credential Injection (LLM Invisible)

Host injects the assertion payload into the JSON-RPC `params._meta` object. This ensures the LLM's `inputSchema` remains purely focused on business logic and prevents hallucination of cryptographic parameters.

#### Phase 6: Backend Verification & Invocation

1. Host resumes tool invocation, sending the modified JSON-RPC payload to the MCPlet server.
2. The MCPlet server extracts `params._meta.mcplet_auth`.
3. The MCPlet server synchronously calls the FIDO2 server to verify the challenge validity and signature.
4. Upon successful verification, the tool executes. If verification fails, the server returns an MCP Error.

### 7.3 Tool Authentication Contract (`params._meta.mcplet_auth`)

#### 7.3.1 Parameter Isolation via `params._meta`

The Host MUST NOT place WebAuthn data in the standard tool `arguments`. It MUST be appended as an extension inside `params._meta.mcplet_auth` during the `tools/call` JSON-RPC request:

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
      "mcplet_auth": {
        "type": "passkey_assertion",
        "challenge": "...",
        "clientDataJSON": "...",
        "authenticatorData": "...",
        "signature": "...",
        "userHandle": "..."
      }
    }
  }
}
```

#### 7.3.2 amiPro Server API Requirements (Informative)

To support this stateless backend enforcement, the underlying FIDO2 Server (e.g., based on `fido2-node-ex`) MUST provide functionality to:

- Generate and temporarily store short-lived (e.g., TTL < 60s) assertion challenges.
- Expose a server-to-server verification endpoint (`/auth/verify-assertion`) allowing the MCPlet backend to submit the `mcplet_auth` payload and receive a definitive boolean trust decision.

### 7.4 Security Considerations & Negative Factors

#### Architecture Trade-offs

- **Service Dependency**: Backend verification creates a hard runtime dependency on the Passkey Server. If the FIDO2 server is unreachable, all `strict` action tools will fail gracefully but remain inoperable.
- **Latency**: The double-roundtrip (Challenge Fetch → Signature → Tool Call → Backend Verify) increases response times. WebUI Profile Hosts SHOULD utilize optimistic UI loading states. Agent Profile Hosts SHOULD implement non-blocking suspension patterns (see Appendix A).
- **Protocol strictness**: Tools relying on `_meta.mcplet_auth` will fail if invoked by standard MCP clients that lack MCPlet-specific interception capabilities.

#### Relying Party ID (`rpId`)

The `rpId` must be correctly configured across the Host, the MCPlet Backend, and the FIDO2 Server to prevent domain mismatch during backend validation.

---

## 8. Tool Visibility

### 8.1 Allowed Configurations

MCPlet supports exactly three visibility configurations:

1. `['model']` (Model-only)
2. `['app']` (App-only)
3. `['model','app']` (Dual-visible)

### 8.2 Enforcement Rules

Host MUST enforce filtering:

- LLM tool list MUST include tools where visibility contains `model`.
- App-triggered internal calls MUST use tools where visibility contains `app`.
- App-only tools MUST be hidden from LLM tool schema.

In Agent Profile, `app` denotes a Host-controlled invocation surface distinct from LLM exposure. It does not require a general-purpose UI layer; it may be realized through controlled orchestration steps such as explicit confirmation flow, scheduler-driven execution, authenticated external A2A entry, or other non-LLM dispatch paths. `app`-visibility enforcement is the responsibility of the Host's agent orchestration layer, and tools with `visibility: ['app']` MUST NOT be included in the tool set presented to the LLM.

### 8.3 Security Guidance

- `action` type tools SHOULD be app-only (`visibility: ['app']`),
- `read` type tools SHOULD be model-visible (`visibility: ['model']` or `['model','app']`),
- dual-visible tools SHOULD be limited to safe or explicitly auditable operations,
- `action` tools exposed to model MUST have `_meta.auth` or equivalent host interception (see Section 4.2 `action` + `['model','app']` row).

### 8.4 Out of Scope

MCPlet does not standardize role-based visibility values (`admin`, `authenticated`, etc.). AuthZ remains host responsibility.

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

The following error codes are defined for MCPlet result envelopes:

| Code | Meaning |
|---|---|
| `AUTH_REQUIRED` | Tool requires authentication but credentials were missing or not injected |
| `AUTH_FAILED` | Backend Passkey verification failed (invalid signature, expired challenge) |
| `VALIDATION_ERROR` | Input arguments failed schema validation |
| `NOT_FOUND` | Requested resource does not exist |
| `RATE_LIMITED` | Request rejected due to rate limiting (Pool-level or per-tool) |
| `SERVICE_UNAVAILABLE` | Upstream dependency (e.g., FIDO2 Server, external API) unreachable |
| `UNKNOWN_ERROR` | Unclassified error |

Implementations MAY define additional codes prefixed with `X_` (e.g., `X_CUSTOM_ERROR`) for domain-specific error conditions.

### 9.2 Requirement Level

- The exact envelope is **SHOULD** (recommended, not hard-required).
- If a tool declares `mcpletToolResultSchemaUri`, returned payloads intended for derived injection (WebUI Profile) or structured output verification (Agent Profile) MUST validate against that schema.
- `mcpletType` in result `_meta` enables downstream consumers (host, AI) to reason about the safety profile of the result without re-consulting tool registration metadata.

### 9.3 Schema URI Convention

MCPlet defines the `mcplet://` URI scheme for internal resource addressing within the MCPlet ecosystem. This scheme is not IANA-registered; it is a convention-local scheme resolved by the Host. Hosts MUST resolve `mcplet://` URIs to the corresponding MCP Resource.

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

- Breaking schema change MUST use new major schema URI.
- Old versions SHOULD be marked deprecated.
- Deprecation SHOULD provide a sunset window (recommended: ≥ 3 months).

---

## 10. Derived Tool Result Channel

*Applicable to WebUI Profile only. This section does not apply to Agent Profile.*

### 10.1 Purpose

Allow host-validated model-derived results to be injected into standard tool-result flow without changing app UI contracts. This enables LLM text responses to synchronously drive UI updates in iframes without requiring explicit user tool invocation.

### 10.2 Use Case: LLM-Driven iframe Synchronization

After LLM generates a text response, the host MAY inject a derived result to synchronize iframe content.

**Flow**:

1. User sends message to LLM in chat.
2. LLM processes and generates text response.
3. Host extracts structured data from LLM response or context.
4. Host creates derived result matching tool schema for iframe tool.
5. Host injects derived result via Derived Tool Result Channel.
6. iframe automatically displays updated content synchronized with LLM text response.

### 10.3 Local Injection Tool

Host MAY expose a local-only tool (e.g., `mcplet_set_tool_result`) for model-side structured result shaping:

```typescript
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

### 10.4 Validation and Safety

Before setting a pending derived result, host MUST:

- verify target tool allowlist — the Host MUST maintain an explicit list of tool IDs that are permitted to receive derived results; this list is defined in Host configuration and MUST NOT be dynamically expanded by LLM output,
- resolve target schema URI (e.g., `mcplet://tool-result-schema/search_restaurants`),
- validate JSON payload against schema,
- enforce payload size limit (recommended: ≤ 1MB),
- enforce TTL upper bound (recommended: ≤ 30 seconds),
- enforce revision monotonicity if revision is used.

### 10.5 iframe Synchronization Protocol

iframe tools MUST:

1. **Register for derived results**: Listen to host via MCP Apps bridge for `tool-result-update` events.
2. **Consume derived result**: Extract result payload and update UI state.
3. **Preserve navigation**: Maintain iframe state (scroll position, form state) when injecting derived result.
4. **Handle expiration**: Discard stale results (older than TTL).
5. **Fallback behavior**: On invalid result, app MAY display placeholder or allow user to retry.

### 10.6 Consumption Semantics

- Derived results are single-use (consume-once).
- Expired derived results MUST be discarded.
- On invalid or expired derived result, host MUST fall back to normal backend tool call.
- iframe SHOULD NOT re-render if receiving duplicate result (idempotency).
- iframe SHOULD preserve local state (loading flags, focus) across result injections.

### 10.7 Error Semantics

Host and UI MUST use MCP-native `isError` semantics as authoritative state. On error derived result, iframe SHOULD display error message to user, allow manual retry or fallback action, and log the error for debugging.

### 10.8 Lifecycle Events

Host SHOULD emit these events to fullscreen iframe:

| Event | When | Payload |
| --- | --- | --- |
| `tool-result-update` | Model-derived result ready | `{ toolId, result, timestamp }` |
| `tool-result-expired` | Previous derived result expired | `{ toolId, expirationTime }` |
| `tool-invoking` | Tool being invoked (real execution) | `{ toolId, inputSchema }` |
| `tool-error` | Tool execution error | `{ toolId, error, code }` |

### 10.9 Chain Calls

Single-layer derived injection only. Multi-hop derived chains are not standardized.

---

## 11. Display Mode

*Applicable to WebUI Profile only.*

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

1. Tool metadata concrete mode (`inline/fullscreen/pip`).
2. Tool metadata `llm-*` mode with valid LLM suggestion.
3. Tool metadata `llm-*` fallback mode.
4. Host config/tool default mode (compatibility source allowed).
5. Hard fallback: `fullscreen`.

### 11.3 Mapping

Final resolved mode MUST map to MCP Apps host display mode value (`inline/fullscreen/pip`).

---

## 12. Chat Mode Profile

*Applicable to WebUI Profile only.*

### 12.1 Supported Modes

Hosts SHOULD support the following chat modes:

- `normal`: Default mode. LLM may respond with text, tool calls, or both.
- `tool-only`: LLM responses MUST contain at least one tool call; text-only responses are rejected.

Additional mode values MAY be defined by Host implementations. If persisted in local storage/config, host MUST validate against the supported enum set and fall back to `normal` on invalid values.

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
- UI data hydration and updates (WebUI Profile only).

### 13.3 Inter-tool Coordination

Direct tool-to-tool hidden state sharing is prohibited. Coordination occurs through explicit host mediation.

In Agent Profile, cross-agent state (e.g., analysis results passed from one agent to another) is managed within Host-internal agent context via the A2A local protocol, not via MCP Resources.

---

## 14. UI Integration via MCP Apps

*Applicable to WebUI Profile only. In Agent Profile, agents produce structured text or JSON outputs consumed by downstream agents or returned to the end system.*

### 14.1 Optionality

UI is optional. Every MCPlet must have a non-UI invocation path.

### 14.2 Lifecycle

UI lifecycle follows MCP Apps. MCPlet does not define alternate lifecycle event names.

### 14.3 Data Binding

Host SHOULD provide input/result data through MCP Apps app handlers (e.g., tool input/result notifications).

### 14.4 iframe Synchronization with Derived Tool Result Channel

Fullscreen iframe tools (`displayMode: fullscreen` or `llm-fullscreen`) MAY receive automatic updates from the Derived Tool Result Channel (Section 10) without requiring explicit user tool invocation.

The synchronization flow, validation rules, TTL enforcement, event names, and consumption semantics are defined in Section 10. This subsection specifies additional iframe-specific responsibilities.

**iframe additional responsibilities:**

- Emit `result-consumed` event back to host for tracking.
- Handle schema validation gracefully (log errors, allow fallback).

**Host additional responsibilities:**

- Support bidirectional communication (host → iframe, iframe → host).

### 14.5 Display Mode Considerations

- `inline`: Derived results update embedded iframe; may resize container.
- `fullscreen`: Derived results fill entire iframe area; most suitable for result synchronization.
- `pip`: Derived results update pip window.
- `llm-inline` / `llm-fullscreen` / `llm-pip`: LLM may suggest display mode AND drive result synchronization.

---

## 15. Fallback and Progressive Enhancement

Every MCPlet SHOULD define deterministic text fallback behavior suitable for hosts without MCP Apps UI support.

Hosts MAY downgrade rendering capability without breaking functional tool execution.

Agent Profile is itself the text-only / headless mode of MCPlet operation.

---

## 16. Security Baseline

### 16.1 Required Security Controls

Implementations MUST apply at least:

- explicit visibility enforcement,
- `mcpletType` declaration and enforcement (host MUST reject tools without declared `mcpletType`),
- **Backend-enforced authentication** (`auth.enforcement: 'strict'`) for `action` type tools exposed to the model, utilizing injected `params._meta` credentials,
- strict schema-based payload validation for derived injection,
- TTL + payload size limits,
- no hidden side effects beyond declared `mcpletType`,
- CSP policy for UI resources (WebUI Profile only).

In Agent Profile, the Host MUST enforce per-agent Pool access at dispatch time: an agent MUST NOT invoke a MCPlet belonging to a Pool not listed in that agent's accessible Pool list. An agent with no accessible Pool list MUST be restricted to Pool-less MCPlets only. This rule applies to all agent types, including the Director Agent, and to External Agents. Consequently, External Agents without any Pool grants are limited to Pool-less MCPlets only.

### 16.2 MCPlet Pool Security Controls

When a MCPlet Pool is used:

- Pool members MUST individually declare their own `mcpletType` and `auth`; the Pool does not override individual MCPlet security declarations.
- The Host MAY enforce additional Pool-level policy (e.g., domain allowlists for external web/API MCPlets, shared rate limits).
- Pool-level policy MUST NOT relax individual MCPlet `auth.enforcement: 'strict'` requirements.
- Pool access grants are declared solely in Host configuration. A MCPlet MUST NOT self-grant access to agents by any mechanism in its own metadata.
- The Director Agent's accessible Pool list and prompt template MUST be defined in Host configuration and MUST NOT be dynamically overridable at runtime by the LLM output.

### 16.3 Passkey Web Page Security Controls (Agent Profile)

- In localhost deployment mode, the Passkey Web Page server MUST bind to loopback (`localhost`) only and MUST NOT be exposed on any network interface.
- In HTTPS deployment mode, the Passkey Web Page MUST be served only from a Host-controlled HTTPS origin matching the configured `rpId`.
- The page origin MUST match the configured `rpId` to satisfy WebAuthn domain binding requirements.
- In localhost deployment mode, the callback port MUST be dynamically allocated per ceremony and released immediately after assertion delivery. A fixed, persistent port MUST NOT be used.
- In HTTPS deployment mode, the callback endpoint MUST be same-origin with the Passkey Web Page or use an equivalent Host-controlled secure return channel bound to the specific authentication ceremony.
- The page MUST enforce a strict Content Security Policy (CSP) that prohibits loading of external scripts or resources.
- The Host MUST validate the origin of the assertion callback before injecting credentials. Callbacks from unexpected origins MUST be rejected.
- The page MUST be closed by the Host upon: successful assertion delivery, user cancellation, or challenge TTL expiry — whichever occurs first.
- Assertion payloads received via the callback MUST NOT be logged or persisted beyond the duration of the tool call injection.

### 16.4 A2A Protocol Security Controls

**A2A local protocol (internal):**

- The A2A local protocol bus MUST be confined to the Host process boundary. Local A2A messages MUST NOT be routable to any system outside the Host.
- The Host MUST verify the identity of the sending agent for every local A2A message before dispatching tool calls on its behalf.

**A2A protocol (external, for External Agents):**

- The Host MUST authenticate every External Agent before accepting any A2A task. Unauthenticated connections MUST be rejected.
- External Agents MUST be granted an explicit accessible Pool list in Host configuration prior to connection. No Pool access is granted by default.
- The Host MUST validate that tasks received from an External Agent do not request MCPlets outside that agent's granted Pool list, regardless of the task payload content.
- External Agent Pool grants MUST NOT exceed the scope of any equivalent internal agent for the same domain.
- If the Host emits or accepts structured A2A JSON payloads, those payloads MUST conform to Section 18.

### 16.5 Recommended Controls

- Rate limiting for local injection pathways.
- Audit logging for `action` type tool calls.
- Domain allowlists for UI resource connectivity (WebUI Profile only).
- Host validation that `action` tools with model visibility have enforced authentication.
- Audit logging for External Agent connections and their tool dispatch activity.

---

## 17. Conformance

### 17.1 Conformance Requirements

A host/server pair claiming MCPlet v202603-03 conformance MUST satisfy:

1. `mcpletType` declaration on all tools and host enforcement.
2. Visibility filtering and enforcement (including agent-level enforcement in Agent Profile).
3. Code-first metadata precedence.
4. Stateless MCPlet execution model.
5. `action` + model-visible tools MUST have authentication enforcement.
6. Per-agent accessible Pool list enforcement at dispatch time (Agent Profile).
7. A2A local protocol confined to Host process boundary (Agent Profile).
8. External Agent authentication and Pool access enforcement via A2A protocol (Agent Profile, if External Agents are supported).
9. If the Host emits or accepts structured A2A JSON payloads, those payloads MUST conform to Section 18.
10. If any MCPlet with `auth.required: 'passkey'` is registered, the Agent Profile Host MUST serve a Passkey Web Page conforming to Section 3.7 and Section 16.3.

**WebUI Profile additional requirements:**

- Display mode resolution rules (Section 11.2).
- MCP Apps lifecycle compatibility.
- Derived-result channel validation and TTL enforcement if Section 10 is implemented.

Derived-result channel (Section 10) is optional for WebUI Profile; if implemented, Section 10 validation rules become mandatory.

---

## 18. Agent-to-Agent (A2A) Protocol Contract

This section defines the canonical JSON payload structures for A2A communication when a Host chooses to serialize A2A interactions into explicit messages. It applies to:

- A2A local protocol payloads that are persisted, traced, replayed, or exchanged across runtime boundaries inside the Host.
- A2A protocol payloads exchanged with External Agents.

This section does not require a specific transport. Transport security, connection management, and scheduling remain Host responsibilities.

### 18.1 Design Alignment with Pool Enforcement

The A2A contract supports capability discovery and task delegation, but it does not change the Host's authorization model defined in Section 3.

- `requestedPools` in an Agent Card expresses requested access only; it MUST NOT be interpreted as granted authority.
- The Host remains solely responsible for assigning each agent's effective **accessible Pool list**.
- All task dispatch decisions MUST be enforced against the Host-granted accessible Pool list, even if the A2A payload requests broader access.

### 18.2 Agent Card (`A2AAgentCard`)

Agents MAY advertise their capabilities to the Host using an Agent Card. This allows Hosts to replace hardcoded routing with explicit capability discovery.

```json
{
  "agentId": "info-gathering-agent",
  "displayName": "Information & Analysis Agent",
  "description": "Retrieves real-time weather and inventory data.",
  "requestedPools": ["info-pool"],
  "inputSchema": {
    "type": "object",
    "properties": {
      "targetStores": { "type": "array", "items": { "type": "string" } },
      "dataTypes": { "type": "array", "items": { "type": "string" } }
    }
  },
  "outputSchema": {
    "type": "object",
    "additionalProperties": true
  },
  "version": "1.0.0"
}
```

Field guidance:

- `agentId` MUST uniquely identify the agent within the Host scope.
- `requestedPools` is optional and advisory. The Host MAY grant a subset or none of the requested Pools. When present, the Host SHOULD use it as input for auto-configuration or for presenting Pool assignment recommendations to operators. When absent, the Host assigns Pools solely from its own configuration.
- `inputSchema` and `outputSchema` SHOULD describe the agent's task contract in JSON Schema-compatible form.

### 18.3 A2A Message Envelope (`A2AMessageEnvelope`)

All serialized A2A task requests and responses MUST include the following envelope fields:

```json
{
  "messageId": "msg-uuid-v4",
  "contextId": "trace-uuid-v4",
  "senderId": "director-agent",
  "recipientId": "info-gathering-agent",
  "timestamp": "2026-03-27T08:00:00.000Z",
  "locale": "ja-JP"
}
```

Field guidance:

- `messageId` MUST uniquely identify the message.
- `contextId` SHOULD remain stable across a multi-step delegated workflow to preserve traceability.
- `senderId` and `recipientId` MUST identify the logical A2A participants.
- `timestamp` SHOULD use RFC 3339 / ISO 8601 UTC format.
- `locale` MAY be omitted if locale is not relevant for the task.

### 18.4 Task Request (`A2ATaskRequest`)

An A2A task request extends the envelope with request-specific fields and payload:

```json
{
  "messageId": "msg-uuid-v4",
  "contextId": "trace-uuid-v4",
  "senderId": "director-agent",
  "recipientId": "info-gathering-agent",
  "timestamp": "2026-03-27T08:00:00.000Z",
  "locale": "ja-JP",
  "type": "task_request",
  "payload": {
    "parameters": {
      "targetStores": ["shinjuku"]
    },
    "history": [
      {
        "role": "system",
        "content": "You are a data analysis agent."
      }
    ]
  }
}
```

Field guidance:

- `type` MUST be `task_request`.
- `payload.parameters` SHOULD match the recipient agent's declared `inputSchema` when one is available.
- `payload.history` MAY include prior conversational or orchestration context needed to complete the task.

### 18.5 Task Response (`A2ATaskResponse`)

An A2A task response extends the envelope with response-specific fields and payload:

```json
{
  "messageId": "msg-uuid-v4-response",
  "contextId": "trace-uuid-v4",
  "senderId": "info-gathering-agent",
  "recipientId": "director-agent",
  "timestamp": "2026-03-27T08:00:02.000Z",
  "locale": "ja-JP",
  "type": "task_response",
  "replyToMessageId": "msg-uuid-v4",
  "status": "success",
  "payload": {
    "result": {
      "shinjuku": { "weather": "rain", "inventory": 500 }
    }
  }
}
```

Field guidance:

- `type` MUST be `task_response`.
- `replyToMessageId` MUST reference the triggering `task_request` message.
- `status` MUST be one of the following values:
  - `success`: Task completed successfully.
  - `error`: Task failed due to an error in the recipient agent or its downstream MCPlet calls.
  - `timeout`: Task did not complete within the allotted time.
  - `cancelled`: Task was cancelled by the sender, the Host, or the recipient agent.
  - `partial`: Task produced partial results but could not complete fully.
- When `status` is `error`, the response SHOULD include a `payload.error` object with `message` (string) and optionally `code` (string, matching MCPlet error codes from Section 9.1 where applicable).
- `payload.result` SHOULD match the agent's declared `outputSchema` when one is available.

### 18.6 Formal Schema Definitions

To support interoperable implementations, the following JSON Schema definitions provide the normative structure for A2A payloads. These schemas use JSON Schema Draft 2020-12 and are the authoritative reference for validation; the JSON examples in Sections 18.2–18.5 are illustrative.

#### 18.6.1 `A2AAgentCard` Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "mcplet://schema/a2a/agent-card",
  "title": "A2AAgentCard",
  "type": "object",
  "required": ["agentId"],
  "properties": {
    "agentId": { "type": "string", "description": "Unique agent identifier within the Host scope." },
    "displayName": { "type": "string", "description": "Human-readable agent name." },
    "description": { "type": "string", "description": "Brief description of agent capabilities." },
    "requestedPools": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Advisory list of Pool names the agent requests access to."
    },
    "inputSchema": {
      "type": "object",
      "description": "JSON Schema describing the agent's expected task parameters.",
      "additionalProperties": true
    },
    "outputSchema": {
      "type": "object",
      "description": "JSON Schema describing the agent's result structure.",
      "additionalProperties": true
    },
    "version": { "type": "string", "description": "Agent version string (SemVer recommended)." }
  },
  "additionalProperties": false
}
```

#### 18.6.2 `A2AMessageEnvelope` Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "mcplet://schema/a2a/message-envelope",
  "title": "A2AMessageEnvelope",
  "type": "object",
  "required": ["messageId", "senderId", "recipientId"],
  "properties": {
    "messageId": { "type": "string", "format": "uuid", "description": "Unique message identifier." },
    "contextId": { "type": "string", "format": "uuid", "description": "Stable trace ID across a delegated workflow." },
    "senderId": { "type": "string", "description": "Logical identifier of the sending agent." },
    "recipientId": { "type": "string", "description": "Logical identifier of the receiving agent." },
    "timestamp": { "type": "string", "format": "date-time", "description": "RFC 3339 UTC timestamp." },
    "locale": { "type": "string", "description": "BCP 47 language tag (e.g., 'ja-JP')." }
  }
}
```

#### 18.6.3 `A2ATaskRequest` Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "mcplet://schema/a2a/task-request",
  "title": "A2ATaskRequest",
  "allOf": [
    { "$ref": "mcplet://schema/a2a/message-envelope" },
    {
      "type": "object",
      "required": ["type", "payload"],
      "properties": {
        "type": { "const": "task_request" },
        "payload": {
          "type": "object",
          "properties": {
            "parameters": {
              "type": "object",
              "description": "Task parameters matching the recipient's inputSchema.",
              "additionalProperties": true
            },
            "history": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["role", "content"],
                "properties": {
                  "role": { "type": "string", "enum": ["system", "user", "assistant"] },
                  "content": { "type": "string" }
                }
              },
              "description": "Optional conversational or orchestration context."
            }
          }
        }
      }
    }
  ]
}
```

#### 18.6.4 `A2ATaskResponse` Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "mcplet://schema/a2a/task-response",
  "title": "A2ATaskResponse",
  "allOf": [
    { "$ref": "mcplet://schema/a2a/message-envelope" },
    {
      "type": "object",
      "required": ["type", "replyToMessageId", "status"],
      "properties": {
        "type": { "const": "task_response" },
        "replyToMessageId": { "type": "string", "format": "uuid", "description": "messageId of the triggering task_request." },
        "status": {
          "type": "string",
          "enum": ["success", "error", "timeout", "cancelled", "partial"],
          "description": "Outcome at the A2A layer."
        },
        "payload": {
          "type": "object",
          "properties": {
            "result": {
              "type": "object",
              "description": "Task result matching the agent's outputSchema.",
              "additionalProperties": true
            },
            "error": {
              "type": "object",
              "properties": {
                "message": { "type": "string", "description": "Human-readable error description." },
                "code": { "type": "string", "description": "Error code (see Section 9.1)." }
              },
              "required": ["message"],
              "description": "Present when status is 'error'."
            }
          }
        }
      }
    }
  ]
}
```

These schemas are identified by `mcplet://schema/a2a/*` URIs using the same convention-local scheme defined in Section 9.3. Implementations MAY also expose these schemas as MCP Resources for runtime-discoverable validation.

---

## 19. Intellectual Property Notice

The editors are aware that certain aspects of this specification may be covered by pending patent applications, including:

- **Japanese Patent Application No. 2026-026931**
  Title: *Inference Result Injection Control Device, Method, and Program*

The patent holder intends to make any essential patent claims available under terms consistent with widely accepted open standards policies.

If this specification progresses toward formal standardization, the patent holder expects to provide licensing commitments consistent with recognized industry practices, which may include Royalty-Free (RF) or Fair, Reasonable, and Non-Discriminatory (FRAND) terms depending on the requirements of the applicable standards organization.

This notice is provided for transparency and does not impose licensing requirements on implementations of this draft specification.

---

## 20. Versioning

Specification version format remains `vYYYYMM-REV`.

### Version History

- **`v202603-03`**: Introduced **Agent Profile** as a first-class Host implementation alongside the existing WebUI Profile. Incorporated the A2A JSON contract and Host interception appendix (originally drafted as a separate `v202603-04` working document, now merged into this version; the standalone `v202603-04` draft is withdrawn).
  - Revised Section 1.1 and 3.3 to define two Host profiles: WebUI Profile and Agent Profile.
  - Updated Section 3.3 Agent Profile Host: added A2A local protocol bus (internal) and A2A protocol endpoint (external) to Host responsibilities.
  - Added Section 3.4 **Agent**: open-ended agent model with per-agent **accessible Pool list** for least-privilege MCPlet dispatch; added **A2A local protocol** for internal inter-agent communication; added built-in **Director Agent** type (timer/cron-triggered, LLM-invoked with configurable prompt).
  - Added Section 3.5 **MCPlet Pool**: named pool model with concrete examples (`media-pool`, `info-pool`); pool-less MCPlets accessible to all agents by default; added `_meta.pool` field to tool metadata contract.
  - Added Section 3.6 **External Agent**: agent outside the Host boundary connecting via A2A protocol; subject to same Pool access enforcement as internal agents; requires explicit authentication and Host-configured Pool grants.
  - Added Section 2.5 **LLM Agnosticism**: Agent Profile integrates with externally configured LLM.
  - Clarified applicability of UI-related sections (11, 12, 14) to WebUI Profile only.
  - Updated Section 16.1: per-agent Pool access enforcement applies to all agent types including Director Agent and External Agents.
  - Updated Section 16.2: Pool access grants are Host-configuration-only; Director Agent prompt and Pool list MUST NOT be overridable by LLM output at runtime.
  - Added Section 3.7 **Passkey Web Page**: mandatory Agent Profile component that provides browser context for WebAuthn ceremony; supports either localhost or Host-controlled HTTPS deployment; returns assertion via a secure Host-controlled callback channel.
  - Updated Section 7.2 Phases 1–4: split workflow descriptions by profile (WebUI Profile / Agent Profile); Agent Profile Phase 4 routes ceremony through Passkey Web Page.
  - Added Section 16.3 **Passkey Web Page Security Controls**: deployment-specific origin and callback constraints, strict CSP, origin validation, assertion non-persistence.
  - Added Section 16.4 **A2A Protocol Security Controls**: A2A local protocol confined to Host boundary; external A2A endpoint requires authentication; External Agent Pool grants enforced at Host dispatch layer.
- **`v202603-02`**: Introduced Backend Enforcement architecture for Passkey authentication.
- `v202603-01`: Added Intellectual Property Notice.
- `v202602-08`: Formalized `_meta.mcpletType` field.
- `v202602-07`: Corrected Passkey authentication specification to align with reference implementation.
- `v202602-06`: Added Tool Authentication Contract (`_meta.auth`).
- `v202602-05`: Code-first primary profile.
- `v202602-03`: MCP Apps App SDK lifecycle alignment.
- `v202602-02`: state management + output schema requirements.
- `v202602-01`: initial draft.

---

## Appendix A: Host Interception Patterns (Informative)

This appendix provides non-normative guidance on implementing the Host interception and Passkey Web Page lifecycle described in Section 7.2 (Phase 2 & Phase 4) for **Agent Profile Hosts**.

Because LLM tool invocations typically operate synchronously or via continuous execution loops (e.g., Python `asyncio` or Node.js async functions), integrating asynchronous human interaction (WebAuthn) requires careful state management to avoid blocking the Host's event loop.

### Recommended Implementation: Event-Driven Promise Suspension

The Host SHOULD implement an interception layer that wraps the tool call in a suspended Promise bound to a unique event token (the `ceremony_token`).

1. **Interception**: When the Agent orchestrator determines a tool requires strict authentication, it generates a `ceremony_token`.
2. **Suspension**: The orchestrator triggers the Passkey Web Page (e.g., via dashboard push) and immediately awaits a Promise tied to the `ceremony_token`. The agent's task thread enters a dormant state.
3. **Callback Handling**: The Host exposes a secure, deployment-specific endpoint (e.g., `POST /internal/auth-callback`). When the Passkey Web Page completes the WebAuthn ceremony, it posts the assertion to this endpoint.
4. **Resumption**: The endpoint handler receives the assertion and emits an internal Host event using the `ceremony_token`. This resolves the suspended Promise.
5. **Injection & Execution**: The orchestrator awakens, injects the assertion into `params._meta.mcplet_auth`, and proceeds to invoke the MCPlet server.

This pattern ensures that the AI orchestration framework remains entirely headless and highly concurrent, effectively bridging rapid machine execution with asynchronous human-in-the-loop authorization.

---
End of MCPlet Specification v202603-03
