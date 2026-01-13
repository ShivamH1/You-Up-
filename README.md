# 🔐 Private Chat

A private, self-destructing chat room application with a terminal-inspired aesthetic. Create ephemeral chat rooms that automatically expire after 10 minutes with real-time messaging.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![Elysia](https://img.shields.io/badge/Elysia-1.4-blueviolet?style=flat-square)
![Redis](https://img.shields.io/badge/Upstash-Redis-red?style=flat-square&logo=redis)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)

---

## ✨ Features

- **Ephemeral Rooms** – Chat rooms self-destruct after 10 minutes
- **Real-time Messaging** – Instant message delivery via Upstash Realtime
- **Anonymous Identity** – Auto-generated usernames (e.g., `anonymous-tiger-x7k2p`)
- **Real-time Countdown** – Visual timer showing remaining room lifetime
- **Copy & Share** – One-click room URL sharing
- **Manual Destruction** – Destroy room instantly with the "DESTROY NOW" button
- **Terminal Aesthetic** – Dark theme with JetBrains Mono font and hacker-style UI

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) |
| **API** | [Elysia.js](https://elysiajs.com/) – Bun-first web framework |
| **Database** | [Upstash Redis](https://upstash.com/) – Serverless Redis |
| **Realtime** | [Upstash Realtime](https://upstash.com/docs/redis/sdks/realtime/overview) – Real-time pub/sub |
| **Type-safe Client** | [Eden Treaty](https://elysiajs.com/eden/treaty.html) – End-to-end typesafe API |
| **State Management** | [TanStack React Query](https://tanstack.com/query) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **Runtime** | [Bun](https://bun.sh/) (recommended) or Node.js |

---

## 🏗️ Architecture & How It Works

### High-Level Flow

```
┌─────────────┐     POST /api/rooms/create     ┌─────────────┐
│   Browser   │ ─────────────────────────────► │  Elysia API │
│  (Next.js)  │ ◄───────────── { roomId } ──── │   (Next.js) │
└─────────────┘                                └──────┬──────┘
       │                                              │
       │ Redirect to /room/[roomId]                   │ HSET meta:{roomId}
       ▼                                              ▼
┌─────────────┐     Upstash Realtime           ┌─────────────┐
│  Room Page  │ ◄──────────────────────────────│   Upstash   │
│  /room/xyz  │        (WebSocket)             │    Redis    │
└─────────────┘                                └─────────────┘
```

### Real-time Communication

The app uses **Upstash Realtime** for instant message delivery:

1. When a user sends a message, the API stores it in Redis and emits a `chat.message` event
2. All connected clients in the room receive the event via WebSocket
3. The UI updates instantly without polling

```typescript
// Server: Emit message event
await realtime.channel(roomId).emit("chat.message", message);

// Client: Listen for events
useRealtime({
  channels: [roomId],
  events: ["chat.message", "chat.destroy"],
  onData: ({ event }) => {
    if (event === "chat.message") refetch();
    if (event === "chat.destroy") router.push("/?destroyed=true");
  },
});
```

### Core Components

#### 1. **Room Creation** (`/api/rooms/create`)

When a user clicks "CREATE SECURE ROOM":

1. The frontend calls `POST /api/rooms/create` via Eden Treaty
2. Elysia generates a unique room ID using `nanoid`
3. Room metadata is stored in Redis as a hash (`meta:{roomId}`)
4. A TTL of 10 minutes is set on the Redis key
5. The room ID is returned to the client
6. User is redirected to `/room/{roomId}`

```typescript
// Room creation logic
const roomId = nanoid();

await redis.hset(`meta:${roomId}`, {
  connected: [],
  createdAt: Date.now(),
});

await redis.expire(`meta:${roomId}`, ROOM_TTL_IN_SECONDS); // 600 seconds
```

#### 2. **Username Generation** (Client-side)

Anonymous usernames are generated and persisted in `localStorage`:

```typescript
const ANIMALS = ["lion", "tiger", "bear", "eagle", "shark", "wolf"];

function generateUsername() {
  const word = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `anonymous-${word}-${nanoid(5)}`; // e.g., "anonymous-wolf-k8x2p"
}
```

#### 3. **Messaging** (`/api/messages`)

Messages are stored in Redis lists and broadcast via Upstash Realtime:

```typescript
// Store message with sender's token for ownership tracking
await redis.rpush(`messages:${roomId}`, {
  ...message,
  token: auth.token,
});

// Broadcast to all connected clients
await realtime.channel(roomId).emit("chat.message", message);
```

#### 4. **Room Destruction** (`DELETE /api/rooms`)

Rooms can be destroyed manually or expire automatically:

```typescript
// Notify all clients before deletion
await realtime.channel(auth.roomId).emit("chat.destroy", {
  isDestroyed: true,
});

// Clean up all room data
await Promise.all([
  redis.del(auth.roomId),
  redis.del(`meta:${auth.roomId}`),
  redis.del(`messages:${auth.roomId}`),
]);
```

#### 5. **Type-Safe API Client** (Eden Treaty)

Eden Treaty provides end-to-end type safety between the Elysia backend and React frontend:

```typescript
// lib/eden.ts
import { treaty } from "@elysiajs/eden";
import type { app } from "../app/api/[[...slugs]]/route";

export const api = treaty<typeof app>("localhost:3000").api;

// Usage in components
const res = await api.rooms.create.post();
// res.data is fully typed as { roomId: string }
```

---

## 📡 API Documentation

### Base URL

```
http://localhost:3000/api
```

### Endpoints

#### Create Room

Creates a new ephemeral chat room.

```http
POST /api/rooms/create
```

**Request**: No body required.

**Response**:

```json
{
  "roomId": "V1StGXR8_Z5jdHi6B-myT"
}
```

---

#### Get Room TTL

Returns the remaining time-to-live for a room in seconds.

```http
GET /api/rooms/ttl?roomId={roomId}
```

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `roomId` | `string` | The room identifier |

**Response**:

```json
{
  "ttl": 542
}
```

---

#### Destroy Room

Immediately destroys a room and notifies all connected clients.

```http
DELETE /api/rooms?roomId={roomId}
```

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `roomId` | `string` | The room identifier |

**Response**: `200 OK` (no body)

---

#### Send Message

Sends a message to a room.

```http
POST /api/messages?roomId={roomId}
```

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `roomId` | `string` | The room identifier |

**Request Body**:

```json
{
  "sender": "anonymous-wolf-k8x2p",
  "text": "Hello, world!"
}
```

**Response**: `200 OK` (no body)

---

#### Get Messages

Retrieves all messages in a room.

```http
GET /api/messages?roomId={roomId}
```

**Query Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `roomId` | `string` | The room identifier |

**Response**:

```json
{
  "messages": [
    {
      "id": "abc123",
      "sender": "anonymous-wolf-k8x2p",
      "text": "Hello!",
      "timestamp": 1736784000000,
      "roomId": "V1StGXR8_Z5jdHi6B-myT"
    }
  ]
}
```

---

### Redis Data Structure

#### Room Metadata

```
Key: meta:{roomId}
Type: Hash
TTL: 600 seconds

Fields:
  - connected: [] (array of connected user IDs)
  - createdAt: 1736784000000 (Unix timestamp in ms)
```

#### Messages

```
Key: messages:{roomId}
Type: List
TTL: Synced with room TTL

Elements: JSON objects with id, sender, text, timestamp, roomId, token
```

---

### Realtime Events

| Event | Channel | Payload | Description |
|-------|---------|---------|-------------|
| `chat.message` | `{roomId}` | `Message` object | New message sent |
| `chat.destroy` | `{roomId}` | `{ isDestroyed: true }` | Room destroyed |

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.0+ (recommended) or Node.js v18+
- [Upstash Redis](https://upstash.com/) account (free tier available)

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-username/realtime_chat.git
cd realtime_chat
```

2. **Install dependencies**

```bash
bun install
# or
npm install
```

3. **Set up environment variables**

Create a `.env.local` file in the project root:

```env
# Upstash Redis credentials (get from https://console.upstash.com)
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

4. **Run the development server**

```bash
bun dev
# or
npm run dev
```

5. **Open in browser**

Navigate to [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
realtime_chat/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── [[...slugs]]/
│   │   │   │   ├── route.ts          # Elysia API routes
│   │   │   │   └── auth.ts           # Auth middleware
│   │   │   └── realtime/
│   │   │       └── route.ts          # Realtime WebSocket endpoint
│   │   ├── room/
│   │   │   └── [roomId]/
│   │   │       └── page.tsx          # Chat room page
│   │   ├── globals.css               # Global styles
│   │   ├── layout.tsx                # Root layout with providers
│   │   └── page.tsx                  # Home page (room creation)
│   ├── components/
│   │   └── Providers.tsx             # React Query provider
│   ├── hooks/
│   │   └── useUsername.ts            # Username generation hook
│   └── lib/
│       ├── eden.ts                   # Type-safe API client
│       ├── realtime.ts               # Upstash Realtime server config
│       ├── realtime-client.ts        # Realtime React hook
│       └── redis.ts                  # Upstash Redis instance
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔧 Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start development server |
| `bun build` | Build for production |
| `bun start` | Start production server |
| `bun lint` | Run ESLint |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis REST API URL |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis authentication token |

---

## 🎨 UI/UX Design

The application features a **terminal-inspired dark theme**:

- **Font**: JetBrains Mono – A monospace font designed for developers
- **Colors**: 
  - Background: `#0a0a0a` (near-black)
  - Primary accent: `#22c55e` (green-500) – for prompts and highlights
  - Warning: `#f59e0b` (amber-500) – for countdown timer
  - Danger: `#ef4444` (red-500) – for low-time warnings
- **Elements**: Terminal-style input with `>` prompt, bordered containers

---

## 📝 License

MIT License – feel free to use this project for learning or building your own ephemeral chat apps.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request
