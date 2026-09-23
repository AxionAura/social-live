# Kick Setup

## Prerequisites

- A Kick account
- Streaming enabled on the channel (Kick may require account verification for live access)

---

## Step-by-Step

### 1. Open Creator Dashboard

1. Go to [creator.kick.com](https://creator.kick.com)
2. Open the dashboard for your channel → **Settings → Stream Key**

### 2. Get Stream Key

1. Copy the **Stream Key**
2. Keep it private — anyone with the key can stream to your channel

### 3. Ingest URL

Kick publishes through an IVS contribution endpoint. The default RTMPS ingest:

```
rtmps://fa723fc1b171.global-contribute.live-video.net:443/app
```

SocialLive uses this by default. If Kick's dashboard shows you a different ingest
server, paste that exact URL into the Ingest URL field of the destination.

Official reference: [How to stream on KICK.com](https://help.kick.com/en/articles/7066931-how-to-stream-on-kick-com)

---

## In SocialLive

1. Open **Destinations** → **Add Destination**
2. Platform: **Kick**
3. Name: e.g., "My Kick channel"
4. Stream Key: *paste the key from step 2*
5. Click **Add Destination**

Click **Test** to verify connectivity.

> **"MISCONFIGURED" in the Kick dashboard?** That badge means Kick received your
> stream but the input doesn't meet its requirements — most commonly a frame
> rate outside 30/60 FPS, or a stream key/ingest mismatch. SocialLive encodes
> at **30 FPS by default** (`VIDEO_FPS` in `.env`). Make sure the ingest URL and
> key match the ones shown on *your* dashboard exactly, and keep the video's
> session inside SocialLive running until Kick's status flips to live.

---

## Stream Metadata (Title, Category)

**With manual stream key mode, metadata is managed in the Kick Creator Dashboard:**

1. Before going live, set the stream **Title** and **Category** in the dashboard
2. SocialLive's stream Title/Description are for your own records — RTMPS cannot
   transmit them to Kick.

OAuth-based metadata management is planned for a future version.
