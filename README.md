# 🔐 Private Chat

A private, self-destructing chat room application with a terminal-inspired aesthetic. Create ephemeral chat rooms that automatically expire after 10 minutes.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![Elysia](https://img.shields.io/badge/Elysia-1.4-blueviolet?style=flat-square)
![Redis](https://img.shields.io/badge/Upstash-Redis-red?style=flat-square&logo=redis)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)

---

## ✨ Features

- **Ephemeral Rooms** – Chat rooms self-destruct after 10 minutes
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
┌─────────────┐                                ┌─────────────┐
│  Room Page  │                                │   Upstash   │
│  /room/xyz  │                                │    Redis    │
└─────────────┘                                └─────────────┘
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

#### 3. **Room Page** (`/room/[roomId]`)

The room page displays:
- **Room ID** with copy-to-clipboard functionality
- **Self-destruct countdown** showing remaining time
- **Message input** with terminal-style prompt (`>`)
- **Destroy button** for immediate room termination

#### 4. **Type-Safe API Client** (Eden Treaty)

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

**Request**

No request body required.

**Response**

```json
{
  "roomId": "V1StGXR8_Z5jdHi6B-myT"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `roomId` | `string` | Unique room identifier (nanoid, 21 chars) |

**Example**

```bash
curl -X POST http://localhost:3000/api/rooms/create
```

```json
{
  "roomId": "xK9_mZpL2rT5vQ8wYnE3a"
}
```

**Notes**
- Room expires automatically after **10 minutes** (600 seconds)
- Room data is stored in Redis with key `meta:{roomId}`

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
│   │   │   └── [[...slugs]]/
│   │   │       └── route.ts      # Elysia API routes
│   │   ├── room/
│   │   │   └── [roomId]/
│   │   │       └── page.tsx      # Chat room page
│   │   ├── globals.css           # Global styles
│   │   ├── layout.tsx            # Root layout with providers
│   │   └── page.tsx              # Home page (room creation)
│   ├── components/
│   │   └── Providers.tsx         # React Query provider
│   └── lib/
│       ├── eden.ts               # Type-safe API client
│       └── redis.ts              # Upstash Redis instance
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
