<div align="center">

# PolyHub <img src="assets/icon.png" alt="PolyHub Logo" width="50" align="center" />

[![Latest Release](https://img.shields.io/github/v/release/Starbug10/Poly-Hub?style=flat-square)](https://github.com/Starbug10/Poly-Hub/releases)
[![Last Commit](https://img.shields.io/github/last-commit/Starbug10/Poly-Hub?style=flat-square)](https://github.com/Starbug10/Poly-Hub/commits/main)
[![Stars](https://img.shields.io/github/stars/Starbug10/Poly-Hub?style=flat-square)](https://github.com/Starbug10/Poly-Hub/stargazers)

> P2P file sharing between trusted users over Tailscale. Built for massive files (5GB+), instant sharing, and a brutalist aesthetic.

</div>

---

## What It Does

Poly-Hub connects 2-3 users via Tailscale's encrypted mesh network to share files of any size instantly. No cloud storage, no upload limits, direct peer-to-peer transfers.

### Core Features

- **Auto Profile Setup** — Detects your Tailscale IP (100.x.x.x), prompts for your name
- **Discovery & Pairing** — Generate a shareable link to connect with another user
- **Shared Gallery** — Central view of all files shared between paired users
- **Drag & Drop Shortcut** — Quick modal to drop files into the shared space
- **Large File Priority** — Optimized for 5GB+ files with resume support

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **App Framework** | Electron + React |
| **Network Layer** | Tailscale (P2P mesh, NAT traversal, encryption) |
| **Sync Protocol** | Custom TCP over Tailscale IPs (100.x.x.x range) |
| **Platform** | Windows first (macOS/Linux possible via Electron) |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Poly-Hub Electron App                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │   React UI  │  │ Sync Engine │  │ Tailscale Detection  │ │
│  └─────────────┘  └─────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                    TCP over Tailscale IP (100.x.x.x)
                              │
┌─────────────────────────────────────────────────────────────┐
│              Tailscale (Installed Separately)                │
│         Provides: P2P mesh, NAT traversal, WireGuard         │
└─────────────────────────────────────────────────────────────┘
```

---

## App Structure

### Pages

| Page | Description |
|------|-------------|
| **Onboarding** | Tailscale detection → Profile setup (name + auto IP) |
| **Discovery** | Generate/receive pairing links to connect users |
| **Gallery** | Shared files grid — main workspace |
| **Profile** | User info in sidebar |

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  POLY-HUB                                          [Profile] │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  SIDEBAR   │                   GALLERY                       │
│            │                                                 │
│  • Gallery │              Shared files grid                  │
│  • Discover│                                                 │
│            │                                                 │
│            │                                                 │
│ ────────── │                                                 │
│  PROFILE   │                                                 │
│  Name      │                                                 │
│  100.x.x.x │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

---

## Onboarding Flow

```
┌─────────────────────────────────────────┐
│           TAILSCALE CHECK               │
│                                         │
│   Detecting Tailscale...                │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ ✓ Tailscale detected            │   │
│   │   IP: 100.64.0.1                │   │
│   └─────────────────────────────────┘   │
│                                         │
│            [Continue]                   │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│           CREATE PROFILE                │
│                                         │
│   Your Tailscale IP                     │
│   ┌─────────────────────────────────┐   │
│   │ 100.64.0.1 (auto-detected)      │   │
│   └─────────────────────────────────┘   │
│                                         │
│   Your Name                             │
│   ┌─────────────────────────────────┐   │
│   │                                 │   │
│   └─────────────────────────────────┘   │
│                                         │
│            [Save Profile]               │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│           DISCOVERY                     │
│                                         │
│   Share this link with your peer:       │
│   ┌─────────────────────────────────┐   │
│   │ polyhub://pair/abc123...        │   │
│   └─────────────────────────────────┘   │
│   [Copy Link]                           │
│                                         │
│   ─── OR ───                            │
│                                         │
│   Paste a link you received:            │
│   ┌─────────────────────────────────┐   │
│   │                                 │   │
│   └─────────────────────────────────┘   │
│   [Connect]                             │
└─────────────────────────────────────────┘
```

---

## Pairing Logic

1. **User A** creates profile → generates pairing link containing their `{name, ip, publicKey}`
2. **User A** shares link with **User B** (via any channel: Discord, email, etc.)
3. **User B** opens link in Poly-Hub → app auto-adds User A to their peer list
4. **User B's** app sends back their `{name, ip, publicKey}` to User A over Tailscale
5. **Both users** now see each other as connected peers

**Requirements:**
- Both users must have Tailscale installed and running
- Both users must complete profile setup before pairing works
- Users must be on the same Tailscale network (tailnet)

---

## Visual Design Rules

### Brutalist Aesthetic
GALLERY
DISCOVER
SETTINGS
PROFILE
Nathan
100.100.197.111
GALLERY

| Element | Rule |
|---------|------|
| **Typography** | Monospace fonts only (JetBrains Mono, IBM Plex Mono). No Inter, no system-ui |
| **Colors** | OKLCH earth tones, Safety Orange (#FF6700), high-contrast monochrome. No purple/indigo/blue gradients |
| **Layout** | Sharp 0px corners, offset grids, editorial magazine-style. No centered rounded cards |
| **Texture** | Film grain, noise overlays, 1px borders. No Gaussian blur, no plastic finishes |
| **Visuals** | Custom SVG line art, lo-fi textures. No emojis, no 3D clay icons |
| **Shadows** | Hard offset "Brutalist" shadows (e.g., `4px 4px 0 #000`). No soft glows |
| **Motion** | Staggered reveals, kinetic typography. No generic fades |

### Color Palette

#### Dark Theme (Default)
```
--color-bg:        #0d0d0d;                 /* Near black */
--color-surface:   #1a1a1a;                 /* Dark surface */
--color-border:    #3d3d3d;                 /* Muted border */
--color-text:      #e8e8e8;                 /* Off-white text */
--color-accent:    #ff6700;                 /* Safety Orange */
```

#### Light Theme (Warm Beige)
```
--color-bg:        oklch(0.92 0.025 87.3);  /* Light beige background */
--color-surface:   oklch(0.8595 0.0329 87.3); /* Warm beige */
--color-border:    oklch(0.65 0.04 87.3);   /* Warm brown border */
--color-text:      oklch(0.18 0.02 60);     /* Near black text */
--color-accent:    #e55a00;                 /* Darker orange for contrast */
```


---

## Prerequisites

- **Tailscale** installed and logged in (Google/Microsoft/GitHub SSO)
- **Windows 10/11** (primary support)
- Both users on the same Tailscale network

---

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build
```

---

## Roadmap

- [x] Project structure and README
- [ ] Electron + React scaffold
- [ ] Brutalist design system (CSS tokens)
- [ ] App shell layout (sidebar, gallery)
- [ ] Tailscale detection
- [ ] Onboarding flow (profile creation)
- [ ] Discovery/pairing system
- [ ] File sync protocol (TCP over Tailscale)
- [ ] Drag & drop modal shortcut
- [ ] Large file handling (5GB+ with resume)
