# Scheduling Posts

PostProxy supports both immediate and scheduled publishing. This guide explains the difference and how to use each option.

## Immediate Publishing

When you create a post **without** specifying a `publish_at` date/time, PostProxy will attempt to publish immediately.

### How to Publish Immediately

1. Create a PostProxy node
2. Set **Resource** to "Post"
3. Set **Operation** to "Create"
4. Fill in **Content** and **Account IDs**
5. **Leave "Publish At" field empty**
6. Execute the node

The post will be queued and published as soon as possible, subject to:
- Rate limits (PostProxy handles these automatically)
- Account availability
- Network conditions

### When to Use Immediate Publishing

- Real-time content (breaking news, live updates)
- Automated workflows that should publish immediately
- Testing and development
- Content that doesn't need specific timing

## Scheduled Publishing

When you specify a `publish_at` date/time, PostProxy will schedule the post for that exact time.

### How to Schedule a Post

1. Create a PostProxy node
2. Set **Resource** to "Post"
3. Set **Operation** to "Create"
4. Fill in **Content** and **Account IDs**
5. **Set "Publish At"** to your desired date and time
6. Execute the node

The post will be scheduled and published at the specified time.

### Date/Time Format

The `publish_at` field accepts ISO 8601 format:
- `2024-12-25T10:00:00Z` (UTC)
- `2024-12-25T10:00:00+02:00` (with timezone)

n8n's dateTime picker will handle the format conversion automatically.

### When to Use Scheduled Publishing

- Content calendars and planned posts
- Time-sensitive announcements
- Optimal posting times for engagement
- Batch scheduling multiple posts
- Cross-timezone coordination

## Understanding Post Status

When you create a post, PostProxy returns a response with status information for each platform:

```json
{
  "id": "NWLtbA",
  "content": "Scheduled post content",
  "status": "pending",
  "draft": false,
  "scheduled_at": "2024-12-25T10:00:00Z",
  "created_at": "2024-12-20T10:00:00Z",
  "platforms": [
    {
      "network": "twitter",
      "status": "pending",
      "params": {},
      "attempted_at": null
    }
  ]
}
```

**Note**: IDs are now alphanumeric strings (e.g., `"NWLtbA"`), not numeric.

### Post Status Values

- **`pending`**: Post is queued and waiting to be published
- **`processed`**: Post has been processed (may be published or failed)
- **`draft`**: Post is saved as a draft

### Platform Status Values (in `platforms` array)

- **`pending`**: Platform-specific publication is pending
- **`published`**: Successfully published to the platform
- **`failed`**: Publication failed (check error details if available)

### Processing State

For immediate posts, you may see `status: "pending"` initially. This is normal:
- PostProxy is handling rate limits automatically
- The post is queued and will be published when quota is available
- Processing typically completes within seconds to minutes
- Once processed, the status will change to `processed` and platform statuses will update accordingly

## Best Practices

### Timezone Considerations

- Always use UTC or specify timezones explicitly
- Consider your audience's timezone when scheduling
- n8n's dateTime picker respects your local timezone settings

### Rate Limits

- PostProxy automatically manages rate limits
- Scheduled posts help distribute load over time
- Don't try to calculate rate limits - let PostProxy handle it

### Error Handling

- Check the response status for each account
- Failed posts will include error details
- You can retry failed posts manually if needed

### Testing

- Test with immediate publishing first
- Verify the post appears correctly
- Then schedule future posts with confidence

## Examples

### Immediate Post
```json
{
  "content": "Hello world!",
  "profileGroup": "zbNFmz",
  "profiles": ["yqWUvR"],
  "publishType": "publish_now"
}
```

### Scheduled Post (Next Week)
```json
{
  "content": "Weekly update!",
  "profileGroup": "zbNFmz",
  "profiles": ["yqWUvR"],
  "publishType": "schedule",
  "publish_at": "2024-12-30T09:00:00Z"
}
```

### Scheduled Post with Multiple Profiles
```json
{
  "content": "Product launch announcement!",
  "profileGroup": "zbNFmz",
  "profiles": ["yqWUvR", "y7dU5N", "RxKU3N"],
  "publishType": "schedule",
  "publish_at": "2024-12-25T10:00:00Z"
}
```

## Troubleshooting

**Post not publishing immediately?**
- Check if rate limits are active (PostProxy handles this automatically)
- Verify profile is connected and active (check `expires_at` field)
- Check the status in the response - "pending" is normal initially
- Check platform-specific statuses in the `platforms` array

**Scheduled post not publishing?**
- Verify the `publish_at` time is in the future
- Check timezone settings
- Ensure the account is still connected at publish time

**Status shows "failed"?**
- Check error details in the response
- Verify account credentials are valid
- Ensure content meets platform requirements (character limits, media formats, etc.)

