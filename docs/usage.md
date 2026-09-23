# Usage Guide

## Workflow Overview

```
Upload Video → Add Destination(s) → Create Stream → Start / Schedule → Monitor → Stop
```

---

## 1. Upload a Video

1. Go to **Videos** page
2. Click **Upload** or drag & drop an MP4/MOV/MKV file
3. Wait for processing (thumbnail + metadata extraction)
4. Video appears with **READY** status

**Supported formats:** MP4 (H.264 + AAC), MOV, MKV  
**Max size:** `MAX_UPLOAD_SIZE` (default 5 GB)

---

## 2. Add a Destination

1. Go to **Destinations** page
2. Click **Add Destination**
3. Choose **YouTube** or **Facebook**
4. Enter:
   - **Name** (your label, e.g., "Main Channel")
   - **Stream Key** (from YouTube Studio / Facebook Live Producer)
   - **Ingest URL** (optional — defaults to platform standard)
5. Click **Add Destination**
6. Click **Test** to verify connectivity

---

## 3. Create a Stream

1. Go to **Streams** → **New Stream** (or Dashboard → **New Stream**)
2. **Step 1 — Select Video**: Pick a READY video
3. **Step 2 — Destinations**: Check one or more destinations
4. **Step 3 — Configure**:
   - **Title** (required)
   - **Description** (optional)
   - **Privacy**: Public / Unlisted / Private (YouTube only; Facebook uses its own audience selector)
   - **Start Mode**:
     - **Start Now** → immediate
     - **Schedule** → pick future date/time (background scheduler starts it)
   - **Loop**: None / Repeat N times / Infinite
5. **Step 4 — Review**: Verify everything
6. **Step 5 — Start**: Click **Start Streaming** (or **Schedule Stream**)

---

## 4. Multi-Destination Streaming

- One stream → multiple destinations simultaneously
- Each destination runs **independent FFmpeg process**
- One can fail (e.g., Facebook) while other continues (YouTube)
- Individual status/metrics per destination

---

## 5. Monitor Live Stream

**Dashboard** shows all active streams with:
- **LIVE** badge + pulsing dot
- Duration counter
- Per-destination status (RUNNING / RECONNECTING / FAILED)
- **Manage** → opens stream detail page
- **Stop** → graceful shutdown

**Stream Detail** shows:
- Real-time metrics: FPS, bitrate (kbps), streamed duration
- Per-destination logs (FFmpeg output, redacted)
- Reconnect history
- Stream logs (global)

---

## 6. Scheduled Streams

- Create stream with **Start Mode: Schedule**
- Pick date/time (your local timezone)
- **Browser can be closed** — background scheduler starts it
- Appears in **Streams** list with status **QUEUED**
- Starts automatically at scheduled time

---

## 7. Loop Modes

| Mode | Behavior |
|------|----------|
| **No Loop** | Play video once, then stop |
| **Repeat N Times** | Play video N times total (N = 2–1000) |
| **Infinite** | Loop forever until manually stopped |

Uses FFmpeg's `-stream_loop` — seamless, no gap between loops.

---

## 8. Stop a Stream

- **Dashboard** → click **Stop** on active stream card
- **Stream Detail** → **Stop** button
- **API** → `POST /api/streams/:id/stop`

Stops all destinations gracefully (SIGINT → 10s → SIGKILL).

---

## 9. History

Go to **History** page for completed/failed streams:
- Filter by: Platform, Status, Date range, Search
- Columns: Date, Video, Destination, Duration, Status
- Click a row to open Stream Detail

---

## 10. Delete a Stream

Only **terminal** streams (COMPLETED / FAILED / STOPPED) can be deleted:
- Streams page → click stream → **Delete**
- Removes stream record + logs (video file preserved)

---

## 11. Video Management

- **Rename**: Click video menu (⋮) → Rename
- **Delete**: Menu → Delete (blocked if used by active stream)
- **Properties**: Menu → Properties (duration, resolution, codec, size)

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl/Cmd + K` | Focus search (where available) |
| `Esc` | Close dialog / cancel |
| `Enter` | Submit focused form |

---

## Tips for Reliable Streaming

1. **Test first**: Use **Destinations → Test** before going live
2. **Bandwidth headroom**: Keep `VIDEO_BITRATE_KBPS` ≤ 70% of sustained upload
3. **Wired connection**: Ethernet > WiFi > mobile
4. **Monitor metrics**: Watch bitrate/FPS in stream detail — drops indicate issues
5. **Keep logs**: Failed streams retain logs for debugging
6. **Backup encryption key**: Without it, stream keys are lost forever