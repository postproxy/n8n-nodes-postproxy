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

When you create a post, PostProxy returns a response with status information for each account:

```json
{
  "id": "post_123",
  "status": "scheduled",
  "accounts": [
    {
      "account_id": "acc_123",
      "status": "scheduled",
      "scheduled_at": "2024-12-25T10:00:00Z"
    }
  ]
}
```

### Status Values

- **`scheduled`**: Post is scheduled for future publishing
- **`processing`**: Post is being processed (normal for immediate posts)
- **`published`**: Post has been successfully published
- **`failed`**: Post failed to publish (check error details)

### Processing State

For immediate posts, you may see `status: "processing"` initially. This is normal:
- PostProxy is handling rate limits automatically
- The post is queued and will be published when quota is available
- Processing typically completes within seconds to minutes

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
  "accounts": ["acc_123"],
  "publish_at": null
}
```

### Scheduled Post (Next Week)
```json
{
  "content": "Weekly update!",
  "accounts": ["acc_123"],
  "publish_at": "2024-12-30T09:00:00Z"
}
```

### Scheduled Post with Multiple Accounts
```json
{
  "content": "Product launch announcement!",
  "accounts": ["acc_123", "acc_456", "acc_789"],
  "publish_at": "2024-12-25T10:00:00Z"
}
```

## Troubleshooting

**Post not publishing immediately?**
- Check if rate limits are active (PostProxy handles this automatically)
- Verify account is connected and active
- Check the status in the response - "processing" is normal

**Scheduled post not publishing?**
- Verify the `publish_at` time is in the future
- Check timezone settings
- Ensure the account is still connected at publish time

**Status shows "failed"?**
- Check error details in the response
- Verify account credentials are valid
- Ensure content meets platform requirements (character limits, media formats, etc.)

