# Poly-Hub

Functional Requirements:
-Configurable IP's for each user, including custom pre made profiles and automatic profile creation.
-Using Tailscale as the foundation it will bridge the connection between primarily 2 Pc's (up to 3).
-Using tailscales built in send files function we will send files between 2 PCs.
-On each users pc during application setup they will dedicate a folder location which will be used with the file storage/sync function. 
-It will contain a folder on all users pc that will act as a central hub where all files sent between each other are stored and will be automatically updated and synced to everyone simultaneously. 
-It will have the ability to drag and drop files into the folder and the other users will instantly be able to see it in their respective folder locations.  

Non functional requirements:
-Latency
-Bandwidth and Size
-Lightweight
-Efficient/quick to use
-Easy to use
-Simple user interface for quick task completion


# possible tech stack
Electron/react for the app that has system level privilges that have safe guards to make sure no errors happen when files are being downloaded/copied and sent.

Connection to the tailscale layer (which will be configurable all through the electron app).

Built for windows first (other OS, since electron can support others, but support/testing for those will be limited).

Some of the features/workflows with this techstack will be:

Shortcut to pop up a thin modal at the top of the users screen where they can drag and drop files from their screen. This will then send into the 'shared libary' where both users can see inside of the apps libary.

This will have safe guarding itself to make sure users can send massive files repeadily or file sizes that would fills/almost fill the other users (one of the users) storage space as this will be shared. This will be changeable in settings to config per user, for example if a user with a large storage space as default settings to allow files aslong as it fits in the allocated space but the small storage space user wants to change that to something smaller like 10gb, if the file(s) exceed that, put a notifcation on the users screen of what the file is, the size and the overflow+allocated storage space it would be.

For visualises, since we are going with electron we have more freedom, it should follow these rules:

Typography: Ban Inter and system-ui. Use distinctive Serifs or technical Monospaces to add character.
Colour: Strictly no Purple/Indigo or linear blue gradients. Use OKLCH earth tones, "Safety Orange", or high-contrast monochrome.
Layout: Eliminate centered, rounded cards. Use sharp 0px corners, offset grids, and editorial magazine-style layouts.
Texture: Replace Gaussian blurs and "plastic" finishes with film grain, noise overlays, and 1px borders.
Visuals: Hard ban on emojis and 3D clay icons. Use lo-fi textures, custom SVG line art, or raw photography.
Shadows: Replace soft "glow" shadows with hard, offset "Brutalist" shadows.
Motion: Avoid generic fades. Use staggered reveals and kinetic, scroll-triggered typography.

# Poly-Hub Project Viability Assessment

This assessment analyzes the project's technical feasibility, onboarding complexity, and workflow logic based on the README and research into Tailscale's actual capabilities.

---

## Viability Summary

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Core Concept** | ✅ Viable | P2P file sync over Tailscale network is sound |
| **Tailscale Choice** | ⚠️ Partial | Great for networking, but **Taildrop won't work** (see below) |
| **Tech Stack** | ✅ Good fit | Electron/React works for system-level file access |
| **Onboarding** | ⚠️ Friction | Tailscale requires external identity provider |
| **Feature Logic** | ⚠️ Gaps | Missing conflict resolution, versioning, discovery |

---

## Critical Issue: Taildrop Limitation

The README states: *"Using Tailscale's built-in send files function"* — **this won't work for multi-user sync**.

**Why**: Taildrop only transfers files between a **single user's own devices**. It cannot send files to another person's devices. This is a fundamental limitation.

**Solution**: Use Tailscale purely as a **network layer** (provides P2P connectivity, NAT traversal, encryption). Build a custom sync protocol on top that communicates over Tailscale IPs (100.x.x.x range) using standard TCP/UDP sockets.

---

## Onboarding Complexity Assessment

| Step | Friction Level | Notes |
|------|----------------|-------|
| Install Tailscale separately | Medium | Users must install before the app works |
| Tailscale requires SSO login | Medium | Google/Microsoft/GitHub account required — no email/password option |
| Choose dedicated sync folder | Low | Standard folder picker in Electron |
| Connect with other users | **High** | How do users discover each other? Not addressed in README |
| Device key expiry (180 days) | Low | Periodic re-authentication required |

**Missing in README**: How users find/connect to each other. Options:
- Share Tailscale IPs manually
- Use Tailscale device names
- Build a discovery/pairing mechanism (invite codes, QR codes, etc.)

---

## Workflow Logic Gaps

1. **Conflict Resolution** — What happens when two users modify the same file offline? No strategy defined. Reference Syncthing's approach: rename conflicts to `file.sync-conflict-<date>-<user>.ext`.

2. **Discovery/Pairing** — How does User A know User B's Tailscale IP? A pairing flow is needed.

3. **Change Detection** — Watching a folder for changes requires filesystem watchers. Consider: file renames, deletions, move operations, rapid consecutive saves.

4. **Large File Handling** — Storage quota safeguards are good, but also consider:
   - Block-based transfer (only sync changed portions of large files)
   - Resume interrupted transfers

5. **Offline Sync** — What happens when one user is offline? Changes must queue and merge when both come online.

---

## Steps to Address

1. **Replace Taildrop reliance** — Document that the app will build custom sync over Tailscale's network layer, not use `taildrop`.

2. **Add discovery/pairing flow** — Define how users connect (invite links, device codes, manual IP entry).

3. **Define conflict resolution strategy** — Decide: last-write-wins, rename conflicts, or prompt user.

4. **Document Tailscale prerequisite** — Users must install Tailscale first and login with Google/Microsoft/GitHub.

5. **Consider Tailscale limits** — Free tier supports 3 users max. Document this or plan for paid tiers.

---

## Further Considerations

1. **Tailscale as separate install vs. bundled guidance?** Recommend: Detect if Tailscale is running, show setup wizard if not — but don't try to install it programmatically (requires admin privileges).

2. **Block-based sync vs. full-file sync?** For files under ~50MB, full-file is simpler. For larger files, block-based (like Syncthing) is essential to avoid re-sending entire files.

3. **Syncthing as alternative foundation?** Syncthing already solves P2P sync with conflict handling — wrapping it in the Electron UI rather than building sync from scratch could save significant effort. Trade-off: less control, but battle-tested sync engine.

---

## Tailscale Tier Limits Reference

| Plan | Users | Devices | Price |
|------|-------|---------|-------|
| **Personal (Free)** | 3 max | 100 | Free |
| **Personal Plus** | 6 max | 100 | $5/month |
| **Starter** | Unlimited | 100 + 10/user | $6/user/month |

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Poly-Hub Electron App                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │   React UI  │  │ Sync Engine │  │ Tailscale IPC Layer  │ │
│  └─────────────┘  └─────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                    TCP/UDP over Tailscale IP
                              │
┌─────────────────────────────────────────────────────────────┐
│              Tailscale (Installed Separately)                │
│         Provides: P2P mesh, NAT traversal, encryption        │
└─────────────────────────────────────────────────────────────┘
```

**Key Decisions:**
1. **Don't use Taildrop** — build custom sync over Tailscale's network layer
2. **Assume Tailscale is pre-installed** — detect and guide if missing
3. **Use standard sockets** — communicate over Tailscale IPs (100.x.x.x range)
4. **Implement Syncthing-like sync** — block-based, hash-verified, conflict-handling
5. **Consider discovery** — use Tailscale API or custom discovery to find peers
