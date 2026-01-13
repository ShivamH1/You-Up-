# 🏗️ Project Architecture

This document explains how the client and server communicate, how WebSocket/realtime works, and the overall logic and code flow.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                           │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐  │
│  │   Eden Treaty   │    │  React Query    │    │   useRealtime Hook  │  │
│  │  (Type-safe     │    │  (Data Fetching │    │   (WebSocket        │  │
│  │   HTTP Client)  │    │   & Caching)    │    │    Subscription)    │  │
│  └────────┬────────┘    └────────┬────────┘    └──────────┬──────────┘  │
│           │                      │                        │             │
└───────────┼──────────────────────┼────────────────────────┼─────────────┘
            │ HTTP Requests        │                        │ WebSocket
            ▼                      ▼                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              SERVER (Next.js)                             │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────┐   │
│  │   /api/[[...slugs]]/route   │    │     /api/realtime/route         │   │
│  │   (Elysia.js REST API)      │    │     (WebSocket Handler)         │   │
│  └──────────────┬──────────────┘    └────────────────┬────────────────┘   │
│                 │                                    │                    │
│                 ▼                                    ▼                    │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    Upstash Realtime + Redis                         │  │
│  │   • Redis: Data storage (rooms, messages, TTL)                      │  │
│  │   • Realtime: Pub/Sub for WebSocket events                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Key Files & Their Roles

### 1. Redis Client

**File:** `src/lib/redis.ts`

```typescript
import { Redis } from "@upstash/redis";
export const redis = Redis.fromEnv();
```

Simple Redis client using environment variables. Used for all data storage.

---

### 2. Realtime Server Config

**File:** `src/lib/realtime.ts`

```typescript
import { InferRealtimeEvents, Realtime } from "@upstash/realtime";
import { z } from "zod";
import { redis } from "./redis";

// Define the schema for all realtime events
const messageSchema = z.object({
  id: z.string(),
  sender: z.string(),
  text: z.string(),
  timestamp: z.number(),
  roomId: z.string(),
  token: z.string().optional(),
});

const schema = {
  chat: {
    message: messageSchema,     // Event: "chat.message"
    destroy: z.object({         // Event: "chat.destroy"
      isDestroyed: z.literal(true),
    }),
  },
};

export const realtime = new Realtime({ schema, redis: redis });
export type RealtimeEvents = InferRealtimeEvents<typeof realtime>;
export type Message = z.infer<typeof messageSchema>;
```

**What it does:**

- Defines the **event schema** using Zod for type safety
- Creates two events: `chat.message` and `chat.destroy`
- Exports the `realtime` instance used by the server to **emit events**
- Exports types for use on the client

---

### 3. Realtime Client Hook

**File:** `src/lib/realtime-client.ts`

```typescript
"use client";
import { createRealtime } from "@upstash/realtime/client";
import { RealtimeEvents } from "./realtime";

export const { useRealtime } = createRealtime<RealtimeEvents>();
```

**What it does:**

- Creates a type-safe React hook for subscribing to WebSocket events
- Uses the same `RealtimeEvents` type from the server for end-to-end type safety

---

### 4. WebSocket Endpoint

**File:** `src/app/api/realtime/route.ts`

```typescript
import { realtime } from "@/src/lib/realtime";
import { handle } from "@upstash/realtime";

export const GET = handle({ realtime });
```

**What it does:**

- Exposes a WebSocket endpoint at `/api/realtime`
- Upstash Realtime handles the WebSocket connection and message routing
- Clients connect here to receive real-time events

---

### 5. Eden Treaty Client

**File:** `src/lib/eden.ts`

```typescript
import { treaty } from "@elysiajs/eden";
import type { app } from "../app/api/[[...slugs]]/route";

export const api = treaty<typeof app>("localhost:3000").api;
```

**What it does:**

- Creates a **type-safe HTTP client** from the Elysia app type
- Provides autocomplete and type checking for all API calls
- Example: `api.rooms.create.post()` is fully typed

---

### 6. REST API Routes

**File:** `src/app/api/[[...slugs]]/route.ts`

This is the main API using **Elysia.js** running inside Next.js:

```typescript
// Room creation (no auth required)
.post("/create", async () => {
  const roomId = nanoid();
  await redis.hset(`meta:${roomId}`, { connected: [], createdAt: Date.now() });
  await redis.expire(`meta:${roomId}`, 600); // 10 min TTL
  return { roomId };
})

// Send message (auth required)
.post("/", async ({ body, auth }) => {
  const message = { id: nanoid(), sender, text, timestamp: Date.now(), roomId };
  
  // 1. Store in Redis
  await redis.rpush(`messages:${roomId}`, { ...message, token: auth.token });
  
  // 2. Broadcast via WebSocket to all subscribers
  await realtime.channel(roomId).emit("chat.message", message);
})

// Destroy room (auth required)
.delete("/", async ({ auth }) => {
  // 1. Notify all clients BEFORE deleting
  await realtime.channel(auth.roomId).emit("chat.destroy", { isDestroyed: true });
  
  // 2. Delete all Redis keys
  await Promise.all([
    redis.del(auth.roomId),
    redis.del(`meta:${auth.roomId}`),
    redis.del(`messages:${auth.roomId}`),
  ]);
})
```

---

### 7. Auth Middleware

**File:** `src/app/api/[[...slugs]]/auth.ts`

```typescript
export const authMiddleware = new Elysia({ name: "auth" })
  .derive({ as: "scoped" }, async ({ query, cookie }) => {
    const roomId = query.roomId;
    const token = cookie["x-auth-token"].value;

    // Validate token exists in room's connected list
    const connected = await redis.hget<string[]>(`meta:${roomId}`, "connected");
    if (!connected?.includes(token)) {
      throw new AuthError("Invalid token.");
    }

    return { auth: { roomId, token, connected } };
  });
```

**What it does:**

- Extracts `roomId` from query params and `token` from cookies
- Validates the user is connected to the room
- Injects `auth` object into route handlers

---

### 8. Room Page Component

**File:** `src/app/room/[roomId]/page.tsx`

```typescript
// Subscribe to realtime events
useRealtime({
  channels: [roomId],                           // Subscribe to this room's channel
  events: ["chat.message", "chat.destroy"],     // Listen for these events
  onData: ({ event }) => {
    if (event === "chat.message") {
      refetch();  // Refresh messages from API
    }
    if (event === "chat.destroy") {
      router.push("/?destroyed=true");  // Redirect on room destroy
    }
  },
});

// Send message via HTTP
const { mutate: sendMessage } = useMutation({
  mutationFn: async ({ text }) => {
    await api.messages.post(
      { sender: username, text },
      { query: { roomId } }
    );
  },
});
```

---

## 🔄 Communication Flows

### Flow 1: Sending a Message

```
┌──────────┐         ┌──────────┐         ┌──────────┐         ┌──────────┐
│  User A  │         │   API    │         │  Redis   │         │  User B  │
│ (sender) │         │  Server  │         │          │         │(receiver)│
└────┬─────┘         └────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │                    │
     │ POST /api/messages │                    │                    │
     │ {sender, text}     │                    │                    │
     │───────────────────►│                    │                    │
     │                    │                    │                    │
     │                    │ RPUSH messages:xyz │                    │
     │                    │───────────────────►│                    │
     │                    │                    │                    │
     │                    │ realtime.emit()    │                    │
     │                    │ "chat.message"     │                    │
     │                    │───────────────────►│                    │
     │                    │                    │                    │
     │                    │                    │ WebSocket push     │
     │                    │                    │───────────────────►│
     │                    │                    │                    │
     │                    │                    │    onData() fires  │
     │                    │                    │    refetch()       │
     │                    │                    │                    │
     │   200 OK           │                    │                    │
     │◄───────────────────│                    │                    │
```

**Step-by-step:**

1. User A types a message and clicks Send
2. Client calls `POST /api/messages` with `{ sender, text }`
3. Server stores message in Redis list `messages:{roomId}`
4. Server emits `chat.message` event via Upstash Realtime
5. Upstash pushes event to all WebSocket subscribers
6. User B's `useRealtime` hook receives the event
7. `onData` callback fires, triggering `refetch()` to get new messages

---

### Flow 2: Room Destruction

```
┌──────────┐         ┌──────────┐         ┌──────────┐         ┌──────────┐
│  User A  │         │   API    │         │  Redis   │         │  User B  │
│(destroys)│         │  Server  │         │          │         │          │
└────┬─────┘         └────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │                    │
     │ DELETE /api/rooms  │                    │                    │
     │───────────────────►│                    │                    │
     │                    │                    │                    │
     │                    │ realtime.emit()    │                    │
     │                    │ "chat.destroy"     │                    │
     │                    │───────────────────►│                    │
     │                    │                    │                    │
     │                    │                    │ WebSocket push     │
     │                    │                    │───────────────────►│
     │                    │                    │                    │
     │                    │                    │ router.push("/")   │
     │                    │                    │                    │
     │                    │ DEL meta:xyz       │                    │
     │                    │ DEL messages:xyz   │                    │
     │                    │───────────────────►│                    │
     │                    │                    │                    │
     │   200 OK           │                    │                    │
     │◄───────────────────│                    │                    │
     │                    │                    │                    │
     │ router.push("/")   │                    │                    │
```

**Step-by-step:**

1. User A clicks "DESTROY NOW"
2. Client calls `DELETE /api/rooms?roomId=xyz`
3. Server emits `chat.destroy` event **before** deleting data
4. Upstash pushes event to all WebSocket subscribers
5. All clients receive event and redirect to home page
6. Server deletes all room data from Redis

---

## 🔌 How WebSocket Works

### Server Side (Upstash Realtime)

```typescript
// Emit an event to all subscribers of a channel
await realtime.channel(roomId).emit("chat.message", message);
```

- `channel(roomId)` – targets a specific room
- `emit("chat.message", message)` – sends the event with payload
- Upstash Realtime handles broadcasting to all connected WebSocket clients

### Client Side (React Hook)

```typescript
useRealtime({
  channels: [roomId],                       // Which channels to subscribe to
  events: ["chat.message", "chat.destroy"], // Which events to listen for
  onData: ({ event, data }) => {            // Callback when event received
    // Handle the event
  },
});
```

- Connects to `/api/realtime` via WebSocket
- Subscribes to the specified channels
- Fires `onData` when matching events arrive

### Why This Pattern?

| Approach | Pros | Cons |
|----------|------|------|
| **Polling** | Simple | High latency, wasteful requests |
| **Long Polling** | Lower latency | Still request overhead |
| **WebSocket** | Real-time, efficient | Requires persistent connection |
| **SSE** | Simpler than WS | One-way only |

This project uses **WebSocket via Upstash Realtime** for instant message delivery with minimal overhead.

---

## 📊 Redis Data Structure

| Key | Type | TTL | Contents |
|-----|------|-----|----------|
| `meta:{roomId}` | Hash | 600s | `{ connected: string[], createdAt: number }` |
| `messages:{roomId}` | List | Synced with room | `[{ id, sender, text, timestamp, roomId, token }]` |

### Example Data

```
# Room metadata
HSET meta:abc123
  connected: ["token1", "token2"]
  createdAt: 1736784000000

# Messages list
RPUSH messages:abc123
  { id: "msg1", sender: "anonymous-wolf-x7k2p", text: "Hello!", ... }
  { id: "msg2", sender: "anonymous-tiger-m3n8q", text: "Hi there!", ... }

# TTL on both keys
EXPIRE meta:abc123 600
EXPIRE messages:abc123 600
```

---

## 🔐 Authentication Flow

```
┌──────────┐                              ┌──────────┐
│  Client  │                              │  Server  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  1. Join room (first request)           │
     │────────────────────────────────────────►│
     │                                         │
     │  2. Server generates token              │
     │     Adds to meta:{roomId}.connected     │
     │     Sets cookie: x-auth-token           │
     │◄────────────────────────────────────────│
     │                                         │
     │  3. Subsequent requests                 │
     │     Cookie: x-auth-token=abc123         │
     │     Query: ?roomId=xyz                  │
     │────────────────────────────────────────►│
     │                                         │
     │  4. Auth middleware validates:          │
     │     - Token exists in connected[]       │
     │     - RoomId matches                    │
     │                                         │
     │  5. Request proceeds or 401             │
     │◄────────────────────────────────────────│
```

**Key Points:**

1. User joins room → receives a token (stored in cookie)
2. Token is added to `meta:{roomId}.connected` array in Redis
3. Every API request includes `roomId` in query + `token` in cookie
4. Auth middleware validates token exists in the room's connected list
5. If valid, request proceeds; otherwise, 401 Unauthorized

---

## 🧩 Technology Summary

| Layer | Technology | Purpose |
|-------|------------|---------|
| **HTTP Client** | Eden Treaty | Type-safe API calls from React |
| **Data Fetching** | React Query | Caching, refetching, mutations |
| **REST API** | Elysia.js | Handle CRUD operations |
| **Realtime** | Upstash Realtime | WebSocket pub/sub |
| **Storage** | Upstash Redis | Ephemeral data with TTL |
| **Validation** | Zod | Schema validation for events & requests |

---

## 🔄 Request/Response Examples

### Create Room

```bash
curl -X POST http://localhost:3000/api/rooms/create
```

```json
{ "roomId": "xK9_mZpL2rT5vQ8wYnE3a" }
```

### Send Message

```bash
curl -X POST "http://localhost:3000/api/messages?roomId=xK9_mZpL2rT5vQ8wYnE3a" \
  -H "Content-Type: application/json" \
  -H "Cookie: x-auth-token=your-token" \
  -d '{"sender": "anonymous-wolf-x7k2p", "text": "Hello!"}'
```

### Get Messages

```bash
curl "http://localhost:3000/api/messages?roomId=xK9_mZpL2rT5vQ8wYnE3a" \
  -H "Cookie: x-auth-token=your-token"
```

```json
{
  "messages": [
    {
      "id": "abc123",
      "sender": "anonymous-wolf-x7k2p",
      "text": "Hello!",
      "timestamp": 1736784000000,
      "roomId": "xK9_mZpL2rT5vQ8wYnE3a"
    }
  ]
}
```

### Destroy Room

```bash
curl -X DELETE "http://localhost:3000/api/rooms?roomId=xK9_mZpL2rT5vQ8wYnE3a" \
  -H "Cookie: x-auth-token=your-token"
```

---

## 📝 Key Takeaways

1. **HTTP for mutations** – Messages are sent via REST API, stored in Redis
2. **WebSocket for notifications** – Clients subscribe to room channels for instant updates
3. **Type safety end-to-end** – Zod schemas + Eden Treaty ensure types match across client/server
4. **Ephemeral by design** – All data has TTL, rooms auto-destruct after 10 minutes
5. **Stateless auth** – Token-based authentication via cookies, validated against Redis
