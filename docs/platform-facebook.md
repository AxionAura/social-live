# Facebook Live Setup

## Prerequisites

- A Facebook account with a **Page** (not a personal profile)
- Page must have **Live Video** permission (standard for Pages)
- **Two-factor authentication** enabled on the Facebook account (recommended)

---

## Step-by-Step

### 1. Open Live Producer

1. Go to [facebook.com/live/production](https://www.facebook.com/live/production)
   or: Facebook → **Live** → **Live Producer**

### 2. Choose "Streaming Software"

1. In Live Producer, select **Streaming Software** (not Webcam)
2. You'll see **Stream Setup** panel

### 3. Get Stream Key

1. Under **Stream Key**, click **Copy**
2. This is your **Persistent Stream Key** (works for multiple broadcasts)

> **Note:** Facebook also offers "One-time Stream Key" — use the persistent one for SocialLive so you don't need to copy a new key each time.

### 4. Ingest URL

Facebook's default RTMPS ingest endpoint:
```
rtmps://live-api-s.facebook.com:443/rtmp/
```

SocialLive uses this by default. Leave the Ingest URL blank unless Facebook instructs otherwise.

---

## In SocialLive

1. Open **Destinations** → **Add Destination**
2. Platform: **Facebook**
3. Name: e.g., "My Page"
4. Stream Key: *paste the persistent key from step 3*
5. Click **Add Destination**

Click **Test** to verify connectivity.

---

## Stream Metadata (Title, Description, Privacy)

**With manual stream key mode, metadata is managed in Live Producer:**

1. In Live Producer, after entering the stream key, you'll see **Post Details**
2. Set:
   - **Title** → your stream title
   - **Description** → description
   - **Audience** → Public / Friends / Only Me / Custom
   - **Tags**, **Location**, **Feeling/Activity**, etc.
3. The stream goes live when you click **Go Live** in SocialLive

> **Tip:** Create a "Saved Live Video" in Live Producer with your preferred defaults, then select it when starting.

---

## Privacy / Audience Mapping

| Facebook Audience | SocialLive `privacy` field |
|-------------------|---------------------------|
| Public | `public` |
| Friends | `unlisted` (closest equivalent) |
| Only Me | `private` |
| Custom | `unlisted` |

The `privacy` field in SocialLive is passed to YouTube; for Facebook it's informational only.

---

## Troubleshooting Facebook

| Issue | Solution |
|-------|----------|
| "Invalid stream key" | Regenerate in Live Producer → Stream Key → Reset |
| "Connection failed" | Check outbound TCP 443; ensure `ALLOW_PRIVATE_RTMP_TARGETS=false` |
| "Stream not found" | Ensure you're using a Page (not personal profile) |
| Low quality / buffering | Increase `VIDEO_BITRATE_KBPS`; Facebook recommends 4000–6000 kbps for 1080p |
| Stream ends prematurely | Check Facebook's stream health in Live Producer; ensure stable upload |

---

## Facebook-Specific Notes

- **Crossposting**: Available in Live Producer to simulcast to multiple Pages
- **Scheduled Live**: Create a scheduled event in Facebook Events, then use the stream key in SocialLive with **Schedule** start mode
- **Monetization**: Ad breaks available for eligible Pages
- **Backup stream**: Facebook supports a redundant ingest URL for failover
- **Stream latency**: Default ~5s; "Low Latency" mode available in Live Producer settings

---

## Advanced: Graph API / Live Video API (Future)

SocialLive V1 uses manual stream key. Future versions will support:
- OAuth connection to Facebook
- Create/manage Live Videos via Graph API
- Set metadata from SocialLive dashboard
- Access insights/analytics

---

## Quick Checklist Before Going Live

- [ ] Using a Facebook Page (not personal profile)
- [ ] Persistent stream key copied to SocialLive
- [ ] Stream metadata set in Live Producer
- [ ] Test destination in SocialLive shows "Reachable"
- [ ] Video uploaded and shows "READY"
- [ ] Upload bandwidth ≥ `VIDEO_BITRATE_KBPS` + overhead
- [ ] 2FA enabled on Facebook account (recommended)