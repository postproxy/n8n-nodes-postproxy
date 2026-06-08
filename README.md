# n8n-nodes-postproxy

Community n8n node for the [PostProxy API](https://postproxy.dev) — a unified API for publishing, scheduling, and managing social media content across multiple platforms.

## Supported platforms

X (Twitter), Facebook, Instagram, LinkedIn, Pinterest, TikTok, YouTube, Threads, Bluesky, Telegram, Google Business

## Resources

| Resource | Operations |
|----------|-----------|
| **Post** | Create, Get, List, Update, Delete, Publish draft, Get stats |
| **Comment** | Create, Delete, Get, List, Hide, Unhide, Like, Unlike, Private Reply |
| **DM Chat** | List, Create, Get |
| **DM Message** | List, Send, Get, React, Unreact |
| **Profile** | Get, List, Delete, Get Placements |
| **Profile Group** | Create, Get, List, Delete |
| **Queue** | Create, Get, List, Update, Delete, Get Next Slot |
| **Webhook** | Create, Get, List, Update, Delete, List Deliveries |

## Installation

### n8n Cloud or self-hosted

```bash
npm install n8n-nodes-postproxy
```

Restart n8n after installation.

### n8n Desktop

Settings → Community Nodes → Install → `n8n-nodes-postproxy`

## Getting started

1. Sign up at [postproxy.dev](https://postproxy.dev) and get your API key from Settings → API Keys
2. In n8n, add a PostProxy node and create a new credential with your API key

## Key concepts

### Profile Groups and Placements

PostProxy organizes profiles into **Profile Groups** (e.g. per brand or client). When creating a post, select a Profile Group first, then pick individual profiles from that group.

For Facebook, LinkedIn, Google Business, and Telegram, you also need to select a **Placement** (page, organization, channel) from the Placements section of the Post › Create node.

### Direct Messages

DM support covers Facebook Messenger, Instagram, Telegram, and Bluesky. Use **DM Chat** to manage conversations and **DM Message** to send and receive messages.

Telegram DMs support `reply_markup` (inline keyboards) — pass it as JSON in Additional Fields when sending a message.

### Webhooks

Subscribe to events like `comment.created`, `message.received`, `platform_post.published`, and more. Point the webhook URL at an n8n Webhook trigger node to build real-time automation.

## Requirements

- n8n v1.0.0 or higher
- PostProxy API key

## Links

- [PostProxy documentation](https://postproxy.dev/reference/)
- [Report issues](https://github.com/postproxy/n8n-nodes-postproxy/issues)

## License

MIT
