# Choosing Account IDs

When creating a post in PostProxy, you need to select which social media accounts should publish the content. This guide explains how to choose the right accounts.

## Step 1: List Your Accounts

Before creating posts, you should first list all available accounts:

1. Add a **PostProxy** node to your workflow
2. Set **Resource** to "Account"
3. Set **Operation** to "List"
4. Execute the node

The output will show all connected accounts with their details:
- `id`: The account ID you'll use when creating posts
- `name`: Display name of the account
- `type`: Social media platform (e.g., "twitter", "facebook", "instagram")
- `username`: Username/handle for the account

## Step 2: Understanding Account IDs

Each account has a unique `id` field. This is what you'll use in the "Account IDs" field when creating posts.

Example output from List Profiles:
```json
{
  "id": "yqWUvR",
  "name": "d__s",
  "network": "twitter",
  "profile_group_id": "zbNFmz",
  "expires_at": null,
  "post_count": 9
}
```

**Note**: IDs are now alphanumeric strings (e.g., `"yqWUvR"`, `"zbNFmz"`), not numeric. In this case, `yqWUvR` is the profile ID you would use.

## Step 3: Selecting Accounts in Create Post

When creating a post:

1. Add a **PostProxy** node
2. Set **Resource** to "Post"
3. Set **Operation** to "Create"
4. In the **Account IDs** field, you'll see a dropdown with all your accounts

The dropdown shows profiles in the format: `Name (Network)` (e.g., "d__s (twitter)")

You can select multiple accounts to publish the same post to different platforms simultaneously.

## Tips

- **Multiple Accounts**: You can select multiple accounts to publish to several platforms at once. PostProxy will handle publishing to each account and return individual statuses.
- **Account Groups**: If your PostProxy account uses account groups, all accounts in your API key's scope will be available. Make sure you're using the correct API key for the account group you want to post to.
- **Testing**: Start with a single account to test your workflow, then expand to multiple accounts once everything works correctly.

## Troubleshooting

**No accounts showing in dropdown?**
- Make sure you've connected accounts in your PostProxy dashboard
- Verify your API key has access to the accounts
- Try using the List Accounts operation first to see what accounts are available

**Account ID not working?**
- Double-check the account ID matches exactly (case-sensitive)
- Ensure the account is still connected in PostProxy
- Verify your API key hasn't expired or been revoked

