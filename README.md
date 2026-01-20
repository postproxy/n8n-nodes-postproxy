# n8n-nodes-postproxy

Community n8n node for the PostProxy API.

PostProxy provides a unified API to publish and schedule posts across multiple social media platforms (X/Twitter, Facebook, Instagram, etc.) with built-in retries, quota handling, and per-account status tracking.

## What is PostProxy?

PostProxy is a unified API that simplifies social media content publishing by:
- **Unified API**: Post to multiple platforms (X, Facebook, Instagram, etc.) through a single interface
- **Built-in Scheduling**: Schedule posts for future publishing with automatic timezone handling
- **Error Management**: Automatic retries and quota management - PostProxy handles rate limits and retries automatically
- **Per-Account Status Tracking**: Get detailed status for each account when publishing to multiple accounts

## Features

- **List Profile Groups**: Get all your profile groups to organize your social media profiles
- **List Profiles**: Get all connected social media profiles across all platforms with pagination
- **Get Profile Details**: Get detailed information about a specific profile (including `expires_at` and `post_count`)
- **Create Posts**: Publish posts to multiple profiles via profile groups
- **Get Post Details**: Get detailed information about a specific post with platform-specific status and insights
- **List Posts**: Get all your posts with full pagination support (`page`, `per_page`, `total`)
- **Update Posts**: Update post content and scheduled time
- **Delete Posts**: Delete posts by ID
- **Media Support**: Attach images or videos to your posts via URLs
- **Platform Parameters**: Pass platform-specific parameters (e.g., alt text, captions) when creating posts
- **Scheduled Publishing**: Schedule posts for specific dates and times
- **Post Status Tracking**: Track post status (`pending`, `processed`, `draft`) and platform-specific statuses
- **Insights**: Access platform insights (impressions, engagement) when available
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

#### List Profile Groups

1. Add a PostProxy node
2. Select **Resource**: Profile Group
3. Select **Operation**: List Profile Groups
4. Execute the node to see all your profile groups

#### List Profiles

1. Add a PostProxy node
2. Select **Resource**: Profile
3. Select **Operation**: List Profiles
4. Execute the node to see all connected social media profiles

#### Create a Post

1. Add a PostProxy node
2. Select **Resource**: Post
3. Select **Operation**: Create
4. Choose **Publish Type**:
   - **Publish now**: Post immediately
   - **Schedule**: Set a specific date and time
5. Fill in:
   - **Profile Group**: Select the profile group to publish to
   - **Profile**: Select one or more profiles from the group
   - **Content**: The text content of your post
   - **Media URLs** (optional): URLs of images or videos to attach
   - **Publish At** (if scheduled): The date and time to publish
6. Execute the node

#### Get Post Details

1. Add a PostProxy node
2. Select **Resource**: Post
3. Select **Operation**: Get Post Details
4. Enter the **Post ID**
5. Execute to get detailed information about the post

#### List Posts

1. Add a PostProxy node
2. Select **Resource**: Post
3. Select **Operation**: List Posts
4. Choose whether to **Return All** posts or set a **Limit**
5. Execute to get a list of your posts

## Examples

### Example 1: Simple Post

Create a simple text post to profiles in a group:

```json
{
  "resource": "post",
  "operation": "create",
  "publishType": "publish_now",
  "profileGroup": "zbNFmz",
  "profiles": ["yqWUvR", "y7dU5N"],
  "content": "Hello from n8n! 🚀",
  "media": []
}
```

**Note**: IDs are now alphanumeric strings (e.g., `"zbNFmz"`, `"yqWUvR"`), not numeric.

### Example 2: Scheduled Post with Media

Schedule a post with an image for multiple profiles:

```json
{
  "resource": "post",
  "operation": "create",
  "publishType": "schedule",
  "publish_at": "2024-12-25T10:00:00Z",
  "profileGroup": "zbNFmz",
  "profiles": ["yqWUvR"],
  "content": "Check out our new product!",
  "media": ["https://example.com/image.jpg"]
}
```

### Example 3: Post with Platform Parameters

Create a post with platform-specific parameters:

```json
{
  "resource": "post",
  "operation": "create",
  "publishType": "publish_now",
  "profileGroup": "zbNFmz",
  "profiles": ["yqWUvR"],
  "content": "Check out our new product!",
  "media": ["https://example.com/image.jpg"],
  "platformParams": "{\"alt_text\": \"Product image description\"}"
}
```

### Example 4: List Posts with Pagination

Get a list of your posts with pagination:

```json
{
  "resource": "post",
  "operation": "getMany",
  "returnAll": false,
  "limit": 10,
  "page": 0,
  "per_page": 10
}
```

**Response includes**:
- `total`: Total number of posts
- `page`: Current page number (0-indexed)
- `per_page`: Items per page
- `data`: Array of posts with fields: `id`, `content`, `status`, `draft`, `scheduled_at`, `created_at`, `platforms` (with `network`, `status`, `params`, `attempted_at`, `insights`)

### Example 5: Get Post Details

Get details of a specific post:

```json
{
  "resource": "post",
  "operation": "get",
  "postId": "NWLtbA",
  "simplify": true
}
```

**Response fields**:
- `id`: Post ID (alphanumeric string)
- `content`: Post content
- `status`: Post status (`pending`, `processed`, etc.)
- `draft`: Whether post is a draft
- `scheduled_at`: Scheduled publish time (if scheduled)
- `created_at`: Creation timestamp
- `platforms`: Array with platform-specific information including `network`, `status`, `params`, `attempted_at`, and `insights`

## Understanding Profile Groups

PostProxy organizes your social media profiles into groups. This allows you to:
- **Publish to multiple platforms at once** by selecting a group
- **Organize profiles by campaign, client, or purpose** for better management
- **Easily manage which profiles receive each post** with granular control

When creating a post, you first select a Profile Group, then choose one or more Profiles from that group. This two-step approach gives you flexibility while maintaining organization.

For more details on selecting profiles, see [Choosing Account IDs](docs/choosing-account-ids.md).

## Workflow Examples

### RSS Feed → PostProxy

1. **RSS Feed Read** node: Fetch latest articles
2. **Code** node: Extract title and link
3. **PostProxy** node (List Profile Groups): Get your profile groups
4. **PostProxy** node (Create Post): Create post with article title and link, selecting profile group and profiles

### Airtable → PostProxy

1. **Airtable Trigger** node: Watch for new rows
2. **PostProxy** node (Create Post): Create post from Airtable data
   - Store profile group ID in Airtable
   - Map profile selections from Airtable columns
3. **Airtable Update** node: Mark row as published with post ID

### Webhook Queue → Scheduled Posts

1. **Webhook** node: Receive post requests (including profile group and profile IDs)
2. **PostProxy** node (Create Post): Create scheduled post with data from webhook
3. **Response** node: Return post status and post ID

### Profile Discovery Workflow

1. **PostProxy** node (List Profile Groups): Get all profile groups
2. **PostProxy** node (List Profiles): Get all available profiles
3. **Code** node: Filter profiles by platform (e.g., only Twitter/X profiles)
4. **PostProxy** node (Create Post): Create posts for filtered profiles

For more detailed examples, see the [examples/](examples/) directory.

## Documentation

- [Choosing Account IDs](docs/choosing-account-ids.md) - How to select the right accounts for your posts
- [Scheduling Posts](docs/scheduling-posts.md) - Understanding immediate vs scheduled publishing

## Rate Limits and Processing

PostProxy automatically manages rate limits and retries for you. When you create a post:

- If rate limits are hit, PostProxy will queue the post and publish it when quota is available
- Posts may show as "pending" or "processing" initially - this is normal
- PostProxy handles retries automatically, so you don't need to worry about temporary failures

The node returns the full API response, including per-platform statuses in the `platforms` array, so you can see the status of each platform's publication.

### Post Status Values

- **`pending`**: Post is queued and waiting to be published
- **`processed`**: Post has been processed (may be published or failed)
- **`draft`**: Post is saved as a draft

### Platform Status Values (in `platforms` array)

- **`pending`**: Platform-specific publication is pending
- **`published`**: Successfully published to the platform
- **`failed`**: Publication failed (check error details if available)

### Response Structure

Posts now include:
- `platforms`: Array of platform-specific information with `network`, `status`, `params`, `attempted_at`, and `insights` (when available)
- `draft`: Boolean indicating if post is a draft
- `status`: Overall post status
- `insights`: Platform insights (impressions, engagement) when available from the platform

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
