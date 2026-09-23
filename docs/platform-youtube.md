# YouTube Live Setup

## Prerequisites

- A Google account with a YouTube channel
- Channel must be **verified** (phone verification) to enable live streaming
- **Live streaming** must be enabled in YouTube Studio (takes 24h after first enable)

---

## Step-by-Step

### 1. Open YouTube Studio

1. Go to [studio.youtube.com](https://studio.youtube.com)
2. Click **Create** (camera icon with +) → **Go live**

### 2. Choose "Streaming Software"

1. In the "Go live" dialog, select **Streaming software** (not Webcam)
2. You'll see the **Stream settings** panel

### 3. Copy Stream Key

1. Under **Stream key**, click **Copy**
2. This is your **YouTube stream key** — paste it into SocialLive

### 4. Optional: Custom Ingest URL

YouTube provides multiple ingest endpoints. The default used by SocialLive is:

```
rtmps://a.rtmp.youtube.com/live2
```

If you experience issues, you can override it in SocialLive's destination settings with one of:
- `rtmps://b.rtmp.youtube.com/live2`
- `rtmps://a.rtmp.youtube.com/live2`
- Regional endpoints (see YouTube docs)

---

## In SocialLive

1. Open **Destinations** → **Add Destination**
2. Platform: **YouTube**
3. Name: e.g., "Main Channel"
4. Stream Key: *paste the key from step 3*
5. (Optional) Ingest URL: leave blank for default
6. Click **Add Destination**

The destination will show **Connected** status. Click **Test** to verify TCP reachability.

---

## Stream Metadata (Title, Description, Privacy)

**Important:** With manual stream key mode (what SocialLive V1 uses), metadata is **managed in YouTube Studio**, not in SocialLive.

1. In YouTube Studio, after copying the stream key, you'll see **Stream settings**
2. Set:
   - **Title** → your stream title
   - **Description** → description
   - **Privacy** → Public / Unlisted / Private
   - **Category**, **License**, etc.
3. Click **Save** (creates a reusable "stream" in YouTube)
4. When you click **Go live** in SocialLive, it publishes to this pre-configured stream

> **Tip:** Create multiple streams in YouTube Studio with different titles/privacy for different events. Each gets its own stream key.

---

## Troubleshooting YouTube

| Issue | Solution |
|-------|----------|
| "Stream key invalid" | Regenerate in YouTube Studio → Stream settings → Reset stream key |
| "Connection refused" | Check `ALLOW_PRIVATE_RTMP_TARGETS=false` (default); ensure outbound TCP 443 allowed |
| "Stream failed: 403" | Channel not verified, or live streaming not enabled (wait 24h) |
| "Bitrate too low" | Increase `VIDEO_BITRATE_KBPS` in `.env` (YouTube recommends ≥ 3000 kbps for 720p) |
| Stream starts but no video in YouTube | Check FFmpeg logs in SocialLive stream details; ensure `libx264` + `aac` |

---

## YouTube-Specific Notes

- **Concurrent streams**: YouTube allows multiple concurrent streams per channel (with different keys)
- **Auto-archive**: Streams are automatically saved as videos on your channel (configurable in YouTube Studio)
- **Chat**: Available in YouTube Studio during the live stream
- **DVR**: Viewers can rewind during live (YouTube feature)
- **Stream health**: Monitor in YouTube Studio → Live control room

---

## Advanced: OAuth / Live Streaming API (Future)

SocialLive V1 uses manual stream key. Future versions will support OAuth flow where:
- You connect your Google account once
- SocialLive creates/manages streams via YouTube Live Streaming API
- Title, description, privacy set from SocialLive dashboard
- No manual key copy/paste needed

---

## Quick Checklist Before Going Live

- [ ] Channel verified (phone)
- [ ] Live streaming enabled (24h wait after first enable)
- [ ] Stream key copied to SocialLive
- [ ] Stream metadata set in YouTube Studio
- [ ] Test destination in SocialLive shows "Reachable"
- [ ] Video uploaded and shows "READY" with thumbnail
- [ ] Upload bandwidth ≥ `VIDEO_BITRATE_KBPS` + overhead