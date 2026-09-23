# Twitch Setup

## Prerequisites

- A Twitch account
- **Two-factor authentication** enabled on the Twitch account (required by Twitch to stream)

---

## Step-by-Step

### 1. Open Creator Dashboard

1. Go to [dashboard.twitch.tv](https://dashboard.twitch.tv)
2. Open **Settings → Stream** (or the Stream Manager while live)

### 2. Get Stream Key

1. Under **Primary Stream Key**, click **Copy**
2. Keep it private — anyone with the key can stream to your channel

### 3. Ingest URL

Twitch's default RTMPS ingest endpoint:

```
rtmps://live.twitch.tv:443/app
```

SocialLive uses this by default. Leave the Ingest URL blank unless Twitch shows you a
different (region-specific) ingest server in the dashboard — in that case paste theirs.

---

## In SocialLive

1. Open **Destinations** → **Add Destination**
2. Platform: **Twitch**
3. Name: e.g., "My Twitch channel"
4. Stream Key: *paste the primary key from step 2*
5. Click **Add Destination**

Click **Test** to verify connectivity.

---

## Stream Metadata (Title, Category)

**With manual stream key mode, metadata is managed in the Twitch Creator Dashboard:**

1. In the dashboard, under **Stream Information**, set:
   - **Title** → your stream title
   - **Category / Game** → what you're streaming
   - **Tags**, language, etc.
2. SocialLive's stream Title/Description are for your own records — RTMPS cannot
   transmit them to Twitch.

OAuth-based metadata management is planned for a future version.
