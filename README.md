# n8n-nodes-postproxy

Community n8n node for the PostProxy API.

PostProxy provides a unified API for publishing and scheduling posts across multiple social media platforms (X/Twitter, Facebook, Instagram, etc.) with built-in retries, quota handling, and per-account status tracking.

## What is PostProxy?

PostProxy is a unified API that simplifies social media content publishing by:
- **Unified API**: Post to multiple platforms (X, Facebook, Instagram, etc.) through a single interface
- **Built-in Scheduling**: Schedule posts for future publishing with automatic timezone handling
- **Error Management**: Automatic retries and quota management - PostProxy handles rate limits and retries automatically
- **Per-Account Status Tracking**: Get detailed status for each account when publishing to multiple accounts

## Features

- **List Accounts**: Get a list of all connected social media accounts
- **Create Posts**: Publish posts to one or multiple accounts simultaneously
- **Media Support**: Attach images or videos to your posts via URLs
- **Scheduled Publishing**: Schedule posts for specific dates and times
- **Error Handling**: Comprehensive error handling with request ID logging

## Requirements

- n8n v1.0.0 or higher
- PostProxy API key (see [Getting Started](#getting-started))

## Installation

### For n8n Cloud or Self-hosted

```bash
npm install n8n-nodes-postproxy
```

After installation, restart n8n. The PostProxy node will appear in the node list under "Transform" category.

### For n8n Desktop

1. Open n8n Desktop
2. Go to Settings → Community Nodes
3. Click "Install a community node"
4. Enter: `n8n-nodes-postproxy`
5. Click "Install"

## Getting Started

### 1. Get Your PostProxy API Key

1. Sign up at [postproxy.dev](https://postproxy.dev)
2. Navigate to your account settings
3. Generate or copy your API key
4. For detailed instructions, see the [PostProxy Authentication documentation](https://postproxy.dev/getting-started/authentication/)

### 2. Configure Credentials in n8n

1. Add a PostProxy node to your workflow
2. Click on "Credential to connect with" → "Create New Credential"
3. Enter your PostProxy API key
4. Save the credential

### 3. Use the Node

#### List Accounts

1. Add a PostProxy node
2. Select **Resource**: Account
3. Select **Operation**: List
4. Execute the node to see all connected social media accounts

#### Create a Post

1. Add a PostProxy node
2. Select **Resource**: Post
3. Select **Operation**: Create
4. Fill in:
   - **Content**: The text content of your post
   - **Account IDs**: Select one or more accounts to publish to
   - **Media URLs** (optional): URLs of images or videos to attach
   - **Publish At** (optional): Schedule for a specific date/time (leave empty for immediate publishing)
5. Execute the node

## Examples

### Example 1: Simple Post

Create a simple text post to a single account:

```json
{
  "resource": "post",
  "operation": "create",
  "content": "Hello from n8n! 🚀",
  "accounts": ["account-id-123"],
  "media": [],
  "publish_at": ""
}
```

### Example 2: Scheduled Post with Media

Schedule a post with an image for multiple accounts:

```json
{
  "resource": "post",
  "operation": "create",
  "content": "Check out our new product!",
  "accounts": ["account-id-123", "account-id-456"],
  "media": ["https://example.com/image.jpg"],
  "publish_at": "2024-12-25T10:00:00Z"
}
```

## Workflow Examples

### RSS Feed → PostProxy

1. **RSS Feed Read** node: Fetch latest articles
2. **Code** node: Extract title and link
3. **PostProxy** node: Create post with article title and link

### Airtable → PostProxy

1. **Airtable Trigger** node: Watch for new rows
2. **PostProxy** node: Create post from Airtable data
3. **Airtable Update** node: Mark row as published

### Webhook Queue → Scheduled Posts

1. **Webhook** node: Receive post requests
2. **PostProxy** node: Create scheduled post
3. **Response** node: Return post status

For more detailed examples, see the [examples/](examples/) directory.

## Documentation

- [Choosing Account IDs](docs/choosing-account-ids.md) - How to select the right accounts for your posts
- [Scheduling Posts](docs/scheduling-posts.md) - Understanding immediate vs scheduled publishing

## Rate Limits and Processing

PostProxy automatically manages rate limits and retries for you. When you create a post:

- If rate limits are hit, PostProxy will queue the post and publish it when quota is available
- Posts may show as "processing" initially - this is normal
- PostProxy handles retries automatically, so you don't need to worry about temporary failures

The node returns the full API response, including per-account statuses, so you can see the status of each account's publication.

## Error Handling

The node provides clear error messages for common issues:

- **Invalid API Key**: Clear error message with request ID
- **Network Issues**: Helpful messages for connection problems
- **API Errors**: Detailed error messages from PostProxy API (4xx/5xx)
- **Request Timeouts**: Automatic timeout handling (30 seconds)

All errors include request IDs when available for easier debugging.

## Support

- **Documentation**: [PostProxy API Docs](https://postproxy.dev/getting-started/overview/)
- **Issues**: Report bugs in the GitHub repository
- **SLA**: Best effort support
- **API Version**: Compatible with PostProxy API v1

## License

MIT
