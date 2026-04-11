import {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IHttpRequestMethods,
  INodeListSearchResult,
  INodeListSearchItems,
  NodeApiError,
  NodeOperationError,
} from "n8n-workflow";

const BASE_URL = "https://api.postproxy.dev/api";

const PLATFORM_PLACEMENT_KEY: Record<string, string> = {
  facebook: "page_id",
  linkedin: "organization_id",
  pinterest: "board_id",
};

interface PostproxyError {
  message?: string;
  error?: string;
  request_id?: string;
}

// Helper function to simplify post response
function simplifyPost(post: any): any {
  // Handle multiple response formats for backward compatibility:
  // - New API format: {id, content, status, draft, scheduled_at, created_at, platforms: [{platform, status, params, attempted_at, insights}]}
  // - Old API format: {id, content, created_at, networks: [{platform, status, attempted_at}]}
  // - Create response: {id, post: {body, scheduled_at}, status, accounts: [...]}
  
  const content = post.content || post.post?.body || post.body || "";
  // Prioritize new 'platforms' format, fallback to old formats for compatibility
  const platforms = post.platforms || post.networks || post.accounts || [];
  
  const result: any = {
    id: post.id,
    content: content,
    created_at: post.created_at,
  };
  
  // Add optional fields only if they exist
  if (post.status !== undefined) {
    result.status = post.status;
  }
  
  if (post.draft !== undefined) {
    result.draft = post.draft;
  }
  
  if (post.scheduled_at !== undefined || post.post?.scheduled_at !== undefined) {
    result.scheduled_at = post.post?.scheduled_at || post.scheduled_at;
  }
  
  if (post.updated_at !== undefined) {
    result.updated_at = post.updated_at;
  }
  
  if (post.profile_group_id !== undefined) {
    result.profile_group_id = post.profile_group_id;
  }
  
  // Map platforms/networks/accounts to unified format
  result.platforms = platforms.map((item: any) => {
    const mapped: any = {
      platform: item.platform,
      status: item.status,
    };
    
    // Add optional fields only if they exist
    if (item.attempted_at !== undefined) {
      mapped.attempted_at = item.attempted_at;
    }
    
    if (item.params !== undefined && item.params !== null) {
      mapped.params = item.params;
    }
    
    if (item.insights !== undefined && item.insights !== null) {
      mapped.insights = item.insights;
    }
    
    // Legacy fields for backward compatibility
    if (item.profile_id !== undefined) {
      mapped.profile_id = item.profile_id;
    }
    
    if (item.error !== undefined) {
      mapped.error = item.error;
    }
    
    if (item.published_url !== undefined) {
      mapped.published_url = item.published_url;
    }
    
    return mapped;
  });
  
  // Keep legacy field name for backward compatibility
  result.network_statuses = result.platforms;
  
  return result;
}

// Helper function to simplify profile response
function simplifyProfile(profile: any): any {
  const result: any = {
    id: profile.id,
    name: profile.name || profile.username,
    platform: profile.platform,
    profile_group_id: profile.profile_group_id,
    status: profile.status,
    created_at: profile.created_at,
  };
  
  // Add optional fields only if they exist
  if (profile.expires_at !== undefined && profile.expires_at !== null) {
    result.expires_at = profile.expires_at;
  }
  
  if (profile.post_count !== undefined) {
    result.post_count = profile.post_count;
  }
  
  return result;
}

// Helper function to extract value from resource locator
function extractResourceLocatorValue(value: any): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null) {
    // Resource locator object format: { mode: 'list' | 'id', value: string }
    return value.value || "";
  }
  return "";
}

async function searchPlacementsByPlatform(
  this: ILoadOptionsFunctions,
  platform: string,
  filter?: string,
): Promise<INodeListSearchResult> {
  try {
    // Get selected profiles from node params to restrict API calls
    let selectedProfileIds: string[] = [];
    try {
      const profiles = this.getCurrentNodeParameter("profiles") as string[] | undefined;
      if (Array.isArray(profiles)) selectedProfileIds = profiles;
    } catch {
      // ignore — will load all profiles
    }

    // Fetch all profiles and filter by platform
    const profilesResponse = await this.helpers.httpRequestWithAuthentication.call(
      this,
      "postProxyApi",
      {
        method: "GET",
        url: `${BASE_URL}/profiles`,
        headers: { "Content-Type": "application/json" },
        json: true,
        timeout: 30000,
      },
    );

    let allProfiles: any[] = profilesResponse.data || profilesResponse.items || (Array.isArray(profilesResponse) ? profilesResponse : []);

    // Keep only profiles of the requested platform
    allProfiles = allProfiles.filter((p: any) => p.platform === platform);

    // If user has selected specific profiles, restrict to those
    if (selectedProfileIds.length > 0) {
      allProfiles = allProfiles.filter((p: any) =>
        selectedProfileIds.includes(String(p.id))
      );
    }

    if (allProfiles.length === 0) return { results: [] };

    // Fetch placements for each matching profile in parallel
    const placementArrays = await Promise.all(
      allProfiles.map(async (profile: any) => {
        try {
          const response = await this.helpers.httpRequestWithAuthentication.call(
            this,
            "postProxyApi",
            {
              method: "GET",
              url: `${BASE_URL}/profiles/${profile.id}/placements`,
              headers: { "Content-Type": "application/json" },
              json: true,
              timeout: 30000,
            },
          );
          const items: any[] = Array.isArray(response) ? response : (response.placements || response.data || []);
          return items;
        } catch {
          return [];
        }
      }),
    );

    // Flatten and deduplicate by id
    const seen = new Set<string>();
    let results: INodeListSearchItems[] = [];
    for (const items of placementArrays) {
      for (const p of items) {
        const id = p.id?.toString() || "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        results.push({ name: p.name || id, value: id });
      }
    }

    if (filter && typeof filter === "string") {
      const filterLower = filter.toLowerCase();
      results = results.filter((item) =>
        item.name.toLowerCase().includes(filterLower) ||
        item.value.toString().toLowerCase().includes(filterLower)
      );
    }

    return { results };
  } catch {
    return { results: [] };
  }
}

async function makeRequest(
  this: IExecuteFunctions,
  method: IHttpRequestMethods,
  endpoint: string,
  body?: any,
): Promise<any> {
  try {
    const response = await this.helpers.httpRequestWithAuthentication.call(
      this,
      "postProxyApi",
      {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers: {
          "Content-Type": "application/json",
        },
        body,
        json: true,
        timeout: 30000,
      },
    );

    return response;
  } catch (error: any) {
    const statusCode = error.statusCode || error.response?.status;
    const requestId = error.response?.headers?.["x-request-id"];

    let errorMessage = "Postproxy API request failed";
    let description = "";

    if (requestId) {
      description += `Request ID: ${requestId}\n`;
    }

    if (statusCode) {
      const errorBody: PostproxyError = error.response?.body || {};
      const apiMessage = errorBody.message || errorBody.error || error.message;

      if (statusCode >= 400 && statusCode < 500) {
        errorMessage = `Postproxy API error (${statusCode})`;
        description += apiMessage || "Client error";
        
        if (statusCode === 401) {
          description += "\n\nPlease check your API credentials.";
        } else if (statusCode === 404) {
          description += "\n\nThe requested resource was not found.";
        } else if (statusCode === 429) {
          description += "\n\nRate limit exceeded. Please try again later.";
        }
      } else if (statusCode >= 500) {
        errorMessage = `Postproxy API server error (${statusCode})`;
        description += apiMessage || "Internal server error";
        description += "\n\nPlease try again later or contact Postproxy support.";
      }
    } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
      errorMessage = "Postproxy API request timed out";
      description = "The request took too long to complete. Please try again.";
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      errorMessage = "Postproxy API connection failed";
      description = "Could not connect to Postproxy API. Please check your network connection.";
    }

    throw new NodeApiError(this.getNode(), error, {
      message: errorMessage,
      description: description || error.message,
      httpCode: String(statusCode || ""),
    });
  }
}

export class PostProxy implements INodeType {
  description: INodeTypeDescription = {
    displayName: "PostProxy",
    name: "postProxy",
    icon: "file:postproxy.svg",
    group: ["transform"],
    version: 1,
    description:
      "Publish and schedule posts across multiple social media platforms",
    defaults: {
      name: "PostProxy",
    },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [
      {
        name: "postProxyApi",
        required: true,
      },
    ],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Comment",
            value: "comment",
          },
          {
            name: "Post",
            value: "post",
          },
          {
            name: "Profile",
            value: "profile",
          },
          {
            name: "Profile Group",
            value: "profileGroup",
          },
          {
            name: "Queue",
            value: "queue",
          },
          {
            name: "Webhook",
            value: "webhook",
          },
        ],
        default: "post",
        description: "The resource to operate on",
      },
      // Queue resource operations
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["queue"],
          },
        },
        options: [
          {
            name: "Create",
            value: "create",
            description: "Create a new posting queue",
            action: "Create a queue",
          },
          {
            name: "Delete",
            value: "delete",
            description: "Delete a posting queue",
            action: "Delete a queue",
          },
          {
            name: "Get",
            value: "get",
            description: "Get a queue by ID",
            action: "Get a queue",
          },
          {
            name: "Get Next Slot",
            value: "nextSlot",
            description: "Get the next available timeslot for a queue",
            action: "Get next queue slot",
          },
          {
            name: "List",
            value: "list",
            description: "List all posting queues",
            action: "List queues",
          },
          {
            name: "Update",
            value: "update",
            description: "Update a queue",
            action: "Update a queue",
          },
        ],
        default: "list",
        description: "The operation to perform",
      },
      // Queue ID parameter (used by get, update, delete, nextSlot)
      {
        displayName: "Queue ID",
        name: "queueId",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["queue"],
            operation: ["get", "update", "delete", "nextSlot"],
          },
        },
        description: "The queue ID",
        placeholder: "e.g. q1abc",
      },
      // Queue create parameters
      {
        displayName: "Profile Group ID",
        name: "queueProfileGroupId",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["queue"],
            operation: ["create"],
          },
        },
        description: "Profile group ID to connect the queue to",
        placeholder: "e.g. pg123",
      },
      {
        displayName: "Name",
        name: "queueName",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["queue"],
            operation: ["create"],
          },
        },
        description: "Queue name",
      },
      {
        displayName: "Additional Fields",
        name: "queueCreateFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: {
          show: {
            resource: ["queue"],
            operation: ["create"],
          },
        },
        options: [
          {
            displayName: "Description",
            name: "description",
            type: "string",
            default: "",
            description: "Optional description",
          },
          {
            displayName: "Timezone",
            name: "timezone",
            type: "string",
            default: "UTC",
            description: "IANA timezone name (e.g. America/New_York)",
            placeholder: "America/New_York",
          },
          {
            displayName: "Jitter (Minutes)",
            name: "jitter",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0, maxValue: 60 },
            description: "Random offset in minutes (+/-) applied to scheduled times for natural posting patterns",
          },
          {
            displayName: "Timeslots (JSON)",
            name: "timeslots",
            type: "json",
            default: "[]",
            description: "Initial weekly timeslots as JSON array. Each item: {\"day\": 1, \"time\": \"09:00\"} where day is 0=Sunday through 6=Saturday",
          },
        ],
      },
      // Queue update parameters
      {
        displayName: "Update Fields",
        name: "queueUpdateFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: {
          show: {
            resource: ["queue"],
            operation: ["update"],
          },
        },
        options: [
          {
            displayName: "Name",
            name: "name",
            type: "string",
            default: "",
            description: "New queue name",
          },
          {
            displayName: "Description",
            name: "description",
            type: "string",
            default: "",
            description: "New description",
          },
          {
            displayName: "Timezone",
            name: "timezone",
            type: "string",
            default: "",
            description: "IANA timezone name",
            placeholder: "America/Los_Angeles",
          },
          {
            displayName: "Enabled",
            name: "enabled",
            type: "boolean",
            default: true,
            description: "Set to false to pause the queue, true to unpause",
          },
          {
            displayName: "Jitter (Minutes)",
            name: "jitter",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0, maxValue: 60 },
            description: "Random offset in minutes (0-60)",
          },
          {
            displayName: "Timeslots (JSON)",
            name: "timeslots",
            type: "json",
            default: "[]",
            description: "Timeslots to add or remove. To add: {\"day\": 1, \"time\": \"09:00\"}. To remove: {\"id\": 42, \"_destroy\": true}",
          },
        ],
      },
      // Webhook resource operations
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["webhook"],
          },
        },
        options: [
          {
            name: "Create",
            value: "create",
            description: "Create a new webhook",
            action: "Create a webhook",
          },
          {
            name: "Delete",
            value: "delete",
            description: "Delete a webhook",
            action: "Delete a webhook",
          },
          {
            name: "Get",
            value: "get",
            description: "Get a webhook by ID",
            action: "Get a webhook",
          },
          {
            name: "List",
            value: "list",
            description: "List all webhooks",
            action: "List webhooks",
          },
          {
            name: "List Deliveries",
            value: "listDeliveries",
            description: "List delivery attempts for a webhook",
            action: "List webhook deliveries",
          },
          {
            name: "Update",
            value: "update",
            description: "Update a webhook",
            action: "Update a webhook",
          },
        ],
        default: "list",
        description: "The operation to perform",
      },
      // Webhook ID parameter (used by get, update, delete, listDeliveries)
      {
        displayName: "Webhook ID",
        name: "webhookId",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["webhook"],
            operation: ["get", "update", "delete", "listDeliveries"],
          },
        },
        description: "The webhook ID",
        placeholder: "e.g. wh_abc123",
      },
      // Webhook create parameters
      {
        displayName: "URL",
        name: "webhookUrl",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["webhook"],
            operation: ["create"],
          },
        },
        description: "HTTPS URL to receive webhook events",
        placeholder: "https://example.com/webhooks",
      },
      {
        displayName: "Events",
        name: "webhookEvents",
        type: "multiOptions",
        required: true,
        default: [],
        displayOptions: {
          show: {
            resource: ["webhook"],
            operation: ["create"],
          },
        },
        options: [
          { name: "All Events (*)", value: "*" },
          { name: "Comment Created", value: "comment.created" },
          { name: "Media Failed", value: "media.failed" },
          { name: "Platform Post Failed", value: "platform_post.failed" },
          { name: "Platform Post Failed Waiting For Retry", value: "platform_post.failed_waiting_for_retry" },
          { name: "Platform Post Insights", value: "platform_post.insights" },
          { name: "Platform Post Published", value: "platform_post.published" },
          { name: "Post Processed", value: "post.processed" },
          { name: "Profile Connected", value: "profile.connected" },
          { name: "Profile Disconnected", value: "profile.disconnected" },
        ],
        description: "Event types to subscribe to",
      },
      {
        displayName: "Description",
        name: "webhookDescription",
        type: "string",
        required: false,
        default: "",
        displayOptions: {
          show: {
            resource: ["webhook"],
            operation: ["create"],
          },
        },
        description: "Optional description for the webhook",
      },
      // Webhook update parameters
      {
        displayName: "Update Fields",
        name: "webhookUpdateFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: {
          show: {
            resource: ["webhook"],
            operation: ["update"],
          },
        },
        options: [
          {
            displayName: "URL",
            name: "url",
            type: "string",
            default: "",
            description: "New HTTPS URL",
            placeholder: "https://example.com/webhooks",
          },
          {
            displayName: "Events",
            name: "events",
            type: "multiOptions",
            default: [],
            options: [
              { name: "All Events (*)", value: "*" },
              { name: "Comment Created", value: "comment.created" },
              { name: "Media Failed", value: "media.failed" },
              { name: "Platform Post Failed", value: "platform_post.failed" },
              { name: "Platform Post Failed Waiting For Retry", value: "platform_post.failed_waiting_for_retry" },
              { name: "Platform Post Insights", value: "platform_post.insights" },
              { name: "Platform Post Published", value: "platform_post.published" },
              { name: "Post Processed", value: "post.processed" },
              { name: "Profile Connected", value: "profile.connected" },
              { name: "Profile Disconnected", value: "profile.disconnected" },
            ],
            description: "New event types to subscribe to",
          },
          {
            displayName: "Enabled",
            name: "enabled",
            type: "boolean",
            default: true,
            description: "Whether to enable or disable the webhook",
          },
          {
            displayName: "Description",
            name: "description",
            type: "string",
            default: "",
            description: "Updated description",
          },
        ],
      },
      // Webhook list deliveries pagination
      {
        displayName: "Return All",
        name: "returnAll",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["webhook"],
            operation: ["listDeliveries"],
          },
        },
        default: false,
        description: "Whether to return all results or only up to a given limit",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        displayOptions: {
          show: {
            resource: ["webhook"],
            operation: ["listDeliveries"],
            returnAll: [false],
          },
        },
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        default: 20,
        description: "Max number of delivery records to return",
      },
      // Comment resource operations
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["comment"],
          },
        },
        options: [
          {
            name: "Create",
            value: "create",
            description: "Post a comment on a published post",
            action: "Create a comment",
          },
          {
            name: "Delete",
            value: "delete",
            description: "Delete a comment from the platform",
            action: "Delete a comment",
          },
          {
            name: "Get",
            value: "get",
            description: "Get a single comment with its replies",
            action: "Get a comment",
          },
          {
            name: "Hide",
            value: "hide",
            description: "Hide a comment on the platform",
            action: "Hide a comment",
          },
          {
            name: "Like",
            value: "like",
            description: "Like a comment on the platform",
            action: "Like a comment",
          },
          {
            name: "List",
            value: "list",
            description: "List comments on a published post",
            action: "List comments",
          },
          {
            name: "Unhide",
            value: "unhide",
            description: "Unhide a previously hidden comment",
            action: "Unhide a comment",
          },
          {
            name: "Unlike",
            value: "unlike",
            description: "Remove a like from a comment",
            action: "Unlike a comment",
          },
        ],
        default: "list",
        description: "The operation to perform",
      },
      // Comment parameters - Post ID (used by all operations)
      {
        displayName: "Post ID",
        name: "commentPostId",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["comment"],
          },
        },
        description: "The ID of the post to manage comments on",
        placeholder: "e.g. abc123",
      },
      // Comment parameters - Profile ID (used by all operations)
      {
        displayName: "Profile ID",
        name: "commentProfileId",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["comment"],
          },
        },
        description: "The profile ID to identify which platform's comments to manage",
        placeholder: "e.g. prof_xyz",
      },
      // Comment parameters - Comment ID (used by get, delete, hide, unhide, like, unlike)
      {
        displayName: "Comment ID",
        name: "commentId",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["comment"],
            operation: ["get", "delete", "hide", "unhide", "like", "unlike"],
          },
        },
        description: "The comment ID (Postproxy ID or platform external ID)",
        placeholder: "e.g. cmt_abc123",
      },
      // Comment parameters - Text (used by create)
      {
        displayName: "Text",
        name: "commentText",
        type: "string",
        required: true,
        default: "",
        typeOptions: {
          rows: 3,
        },
        displayOptions: {
          show: {
            resource: ["comment"],
            operation: ["create"],
          },
        },
        description: "The comment text content",
      },
      // Comment parameters - Parent ID (optional, used by create for replies)
      {
        displayName: "Parent Comment ID",
        name: "commentParentId",
        type: "string",
        required: false,
        default: "",
        displayOptions: {
          show: {
            resource: ["comment"],
            operation: ["create"],
          },
        },
        description: "ID of the comment to reply to. Leave empty to comment on the post itself.",
        placeholder: "e.g. cmt_abc123",
      },
      // Comment parameters - Pagination (used by list)
      {
        displayName: "Return All",
        name: "returnAll",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["comment"],
            operation: ["list"],
          },
        },
        default: false,
        description: "Whether to return all results or only up to a given limit",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        displayOptions: {
          show: {
            resource: ["comment"],
            operation: ["list"],
            returnAll: [false],
          },
        },
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        default: 20,
        description: "Max number of comments to return",
      },
      {
        displayName: "Page",
        name: "page",
        type: "number",
        displayOptions: {
          show: {
            resource: ["comment"],
            operation: ["list"],
            returnAll: [false],
          },
        },
        typeOptions: {
          minValue: 0,
        },
        default: 0,
        description: "Page number (0-indexed) for pagination",
      },
      // Post resource operations
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["post"],
          },
        },
        options: [
          {
            name: "Create",
            value: "create",
            description: "Create and publish or schedule a post",
            action: "Create a post",
          },
          {
            name: "Delete",
            value: "delete",
            description: "Delete a post",
            action: "Delete a post",
          },
          {
            name: "Get Post Details",
            value: "get",
            description: "Get a post by ID",
            action: "Get post details",
          },
          {
            name: "Get Stats",
            value: "getStats",
            description: "Get engagement stats snapshots for one or more posts",
            action: "Get post stats",
          },
          {
            name: "List Posts",
            value: "getMany",
            description: "Get many posts",
            action: "List posts",
          },
          {
            name: "Update",
            value: "update",
            description: "Update a post",
            action: "Update a post",
          },
          {
            name: "Publish",
            value: "publish",
            description: "Publish a draft post",
            action: "Publish a draft post",
          },
        ],
        default: "create",
        description: "The operation to perform",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["profile"],
          },
        },
        options: [
          {
            name: "Delete",
            value: "delete",
            description: "Disconnect and remove a profile",
            action: "Delete a profile",
          },
          {
            name: "Get Profile Details",
            value: "get",
            description: "Get a profile by ID",
            action: "Get profile details",
          },
          {
            name: "List Placements",
            value: "getPlacements",
            description: "List available placements for a profile (Facebook pages, LinkedIn organizations, Pinterest boards)",
            action: "List profile placements",
          },
          {
            name: "List Profiles",
            value: "getMany",
            description: "Get many profiles",
            action: "List profiles",
          },
        ],
        default: "getMany",
        description: "The operation to perform",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["profileGroup"],
          },
        },
        options: [
          {
            name: "Create",
            value: "create",
            description: "Create a new profile group",
            action: "Create a profile group",
          },
          {
            name: "Delete",
            value: "delete",
            description: "Delete a profile group and all its profiles",
            action: "Delete a profile group",
          },
          {
            name: "Get",
            value: "get",
            description: "Get a profile group by ID",
            action: "Get a profile group",
          },
          {
            name: "List Profile Groups",
            value: "getMany",
            description: "Get many profile groups",
            action: "List profile groups",
          },
        ],
        default: "getMany",
        description: "The operation to perform",
      },
      // Profile Group - Get / Delete parameters
      {
        displayName: "Profile Group ID",
        name: "profileGroupId",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["profileGroup"],
            operation: ["get", "delete"],
          },
        },
        description: "The profile group ID",
        placeholder: "e.g. pg123",
      },
      // Profile Group - Create parameters
      {
        displayName: "Name",
        name: "profileGroupName",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["profileGroup"],
            operation: ["create"],
          },
        },
        description: "Name for the new profile group",
      },
      {
        displayName: "Publish Type",
        name: "publishType",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        options: [
          {
            name: "Publish now",
            value: "publish_now",
            description: "Publish the post immediately",
          },
          {
            name: "Schedule",
            value: "schedule",
            description: "Schedule the post for later",
          },
          {
            name: "Draft",
            value: "draft",
            description: "Create a draft post that won't be published automatically",
          },
          {
            name: "Queue",
            value: "queue",
            description: "Add the post to a queue — timeslot will be assigned automatically",
          },
        ],
        default: "publish_now",
        description: "When to publish the post (or create as draft)",
      },
      {
        displayName: "Publish At",
        name: "publish_at",
        type: "dateTime",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
            publishType: ["schedule"],
          },
        },
        description:
          "Schedule the post for a specific date and time (ISO 8601 format)",
      },
      {
        displayName: "Profile Group",
        name: "profileGroup",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        required: true,
        description: "The profile group to publish to",
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            typeOptions: {
              searchListMethod: "searchProfileGroups",
              searchable: true,
            },
          },
          {
            displayName: "By ID",
            name: "id",
            type: "string",
            placeholder: "e.g. zbNFmz",
          },
        ],
      },
      {
        displayName: "Profile",
        name: "profiles",
        type: "multiOptions",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        typeOptions: {
          loadOptionsMethod: "getProfilesForGroup",
          loadOptionsDependOn: ["profileGroup"],
        },
        required: true,
        default: [],
        placeholder: "Select profiles from the group",
        description: "Select the social media platforms to publish to",
      },
      {
        displayName: "Additional Fields",
        name: "postAdditionalFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        options: [
          {
            displayName: "Facebook Page",
            name: "facebookPage",
            type: "resourceLocator",
            default: { mode: "list", value: "" },
            description: "Facebook page to publish to (for Facebook profiles)",
            modes: [
              {
                displayName: "From List",
                name: "list",
                type: "list",
                typeOptions: {
                  searchListMethod: "searchFacebookPages",
                  searchable: true,
                },
              },
              {
                displayName: "By ID",
                name: "id",
                type: "string",
                placeholder: "e.g. 123456789",
              },
            ],
          },
          {
            displayName: "LinkedIn Organization",
            name: "linkedinOrganization",
            type: "resourceLocator",
            default: { mode: "list", value: "" },
            description: "LinkedIn organization page to publish to (for LinkedIn profiles)",
            modes: [
              {
                displayName: "From List",
                name: "list",
                type: "list",
                typeOptions: {
                  searchListMethod: "searchLinkedInOrganizations",
                  searchable: true,
                },
              },
              {
                displayName: "By ID",
                name: "id",
                type: "string",
                placeholder: "e.g. 123456789",
              },
            ],
          },
          {
            displayName: "Pinterest Board",
            name: "pinterestBoard",
            type: "resourceLocator",
            default: { mode: "list", value: "" },
            description: "Pinterest board to publish to (for Pinterest profiles)",
            modes: [
              {
                displayName: "From List",
                name: "list",
                type: "list",
                typeOptions: {
                  searchListMethod: "searchPinterestBoards",
                  searchable: true,
                },
              },
              {
                displayName: "By ID",
                name: "id",
                type: "string",
                placeholder: "e.g. abc123",
              },
            ],
          },
        ],
      },
      {
        displayName: "Content",
        name: "content",
        type: "string",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        typeOptions: {
          rows: 4,
        },
        required: true,
        default: "",
        description: "The text content of the post",
      },
      {
        displayName: "Media URLs",
        name: "media",
        type: "string",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        typeOptions: {
          multipleValues: true,
          multipleValueButtonText: "Add Media URL",
        },
        required: false,
        description:
          "Media URLs (images or videos) to attach to the post. Can be entered manually (one per field) or use expressions like {{ $json.mediaUrl }}. Each URL must start with http:// or https://",
        default: [],
        placeholder: "https://example.com/image.jpg",
      },
      {
        displayName: "Platform Parameters",
        name: "platformParams",
        type: "json",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        required: false,
        default: "{}",
        description: "Platform-specific parameters as JSON object, keyed by platform name (e.g., {\"facebook\": {\"page_id\": \"123\"}, \"linkedin\": {\"organization_id\": \"456\"}}). Use the Profile > List Placements operation to find available page/organization IDs.",
      },
      {
        displayName: "Queue",
        name: "queueIdForPost",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        required: false,
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
            publishType: ["queue"],
          },
        },
        description: "Queue to add the post to. The queue will automatically assign a timeslot. Do not use together with a scheduled time.",
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            typeOptions: {
              searchListMethod: "searchQueues",
              searchable: true,
            },
          },
          {
            displayName: "By ID",
            name: "id",
            type: "string",
            placeholder: "e.g. q1abc",
          },
        ],
      },
      {
        displayName: "Queue Priority",
        name: "queuePriority",
        type: "options",
        required: false,
        default: "medium",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
            publishType: ["queue"],
          },
        },
        options: [
          { name: "High", value: "high" },
          { name: "Medium", value: "medium" },
          { name: "Low", value: "low" },
        ],
        description: "Priority when adding to a queue. Higher priority posts get earlier timeslots.",
      },
      {
        displayName: "Thread Posts (JSON)",
        name: "threadPosts",
        type: "json",
        required: false,
        default: "[]",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        description: "Thread child posts as JSON array (X/Twitter and Threads only). Each item: {\"body\": \"text\", \"media\": [\"url\"]}. The parent post is published first, then each child as a reply in order.",
      },
      // Parameters for Post - Get operation
      {
        displayName: "Post",
        name: "postId",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["get"],
          },
        },
        required: true,
        description: "The post to get details for",
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            typeOptions: {
              searchListMethod: "searchPosts",
              searchable: true,
            },
          },
          {
            displayName: "By ID",
            name: "id",
            type: "string",
            placeholder: "e.g. NWLtbA",
          },
        ],
      },
      // Parameters for Post - Delete operation
      {
        displayName: "Post",
        name: "postId",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["delete"],
          },
        },
        required: true,
        description: "The post to delete",
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            typeOptions: {
              searchListMethod: "searchPosts",
              searchable: true,
            },
          },
          {
            displayName: "By ID",
            name: "id",
            type: "string",
            placeholder: "e.g. NWLtbA",
          },
        ],
      },
      // Parameters for Post - Update operation
      {
        displayName: "Post",
        name: "postId",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["update"],
          },
        },
        required: true,
        description: "The post to update",
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            typeOptions: {
              searchListMethod: "searchPosts",
              searchable: true,
            },
          },
          {
            displayName: "By ID",
            name: "id",
            type: "string",
            placeholder: "e.g. NWLtbA",
          },
        ],
      },
      {
        displayName: "Update Fields",
        name: "updateFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["update"],
          },
        },
        options: [
          {
            displayName: "Content",
            name: "content",
            type: "string",
            typeOptions: {
              rows: 4,
            },
            default: "",
            description: "The updated text content of the post",
          },
          {
            displayName: "Scheduled At",
            name: "scheduled_at",
            type: "dateTime",
            default: "",
            description: "Update the scheduled publish time (ISO 8601 format)",
          },
        ],
      },
      // Parameters for Post - Publish operation
      {
        displayName: "Post",
        name: "postId",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["publish"],
          },
        },
        required: true,
        description: "The draft post to publish",
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            typeOptions: {
              searchListMethod: "searchPosts",
              searchable: true,
            },
          },
          {
            displayName: "By ID",
            name: "id",
            type: "string",
            placeholder: "e.g. NWLtbA",
          },
        ],
      },
      // Parameters for Post - Get Stats operation
      {
        displayName: "Post IDs",
        name: "postIds",
        type: "string",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["getStats"],
          },
        },
        description: "Comma-separated list of post IDs to get stats for (max 50)",
        placeholder: "abc123,def456,ghi789",
      },
      {
        displayName: "Additional Filters",
        name: "statsFilters",
        type: "collection",
        placeholder: "Add Filter",
        default: {},
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["getStats"],
          },
        },
        options: [
          {
            displayName: "Profiles",
            name: "profiles",
            type: "string",
            default: "",
            description: "Comma-separated list of profile IDs or platform names to filter stats by (e.g. instagram,twitter or abc123,def456)",
            placeholder: "instagram,twitter",
          },
          {
            displayName: "From",
            name: "from",
            type: "dateTime",
            default: "",
            description: "Only include snapshots recorded at or after this time",
          },
          {
            displayName: "To",
            name: "to",
            type: "dateTime",
            default: "",
            description: "Only include snapshots recorded at or before this time",
          },
        ],
      },
      // Simplify option for Post operations
      {
        displayName: "Simplify",
        name: "simplify",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["get", "getMany"],
          },
        },
        default: true,
        description: "Whether to return a simplified version of the response with only the most important fields",
      },
      // Parameters for Post - Get Many operation
      {
        displayName: "Return All",
        name: "returnAll",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["getMany"],
          },
        },
        default: false,
        description: "Whether to return all results or only up to a given limit",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["getMany"],
            returnAll: [false],
          },
        },
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        default: 50,
        description: "Max number of results to return",
      },
      {
        displayName: "Page",
        name: "page",
        type: "number",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["getMany"],
            returnAll: [false],
          },
        },
        typeOptions: {
          minValue: 0,
        },
        default: 0,
        description: "Page number (0-indexed) for pagination",
      },
      {
        displayName: "Per Page",
        name: "per_page",
        type: "number",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["getMany"],
          },
        },
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        default: 10,
        description: "Number of items per page (API pagination parameter)",
      },
      {
        displayName: "Filters",
        name: "postFilters",
        type: "collection",
        placeholder: "Add Filter",
        default: {},
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["getMany"],
          },
        },
        options: [
          {
            displayName: "Status",
            name: "status",
            type: "options",
            default: "",
            options: [
              { name: "Any", value: "" },
              { name: "Draft", value: "draft" },
              { name: "Scheduled", value: "scheduled" },
              { name: "Published", value: "published" },
              { name: "Failed", value: "failed" },
            ],
            description: "Filter posts by status",
          },
          {
            displayName: "Platforms",
            name: "platforms",
            type: "multiOptions",
            default: [],
            options: [
              { name: "Facebook", value: "facebook" },
              { name: "Instagram", value: "instagram" },
              { name: "LinkedIn", value: "linkedin" },
              { name: "Pinterest", value: "pinterest" },
              { name: "Threads", value: "threads" },
              { name: "TikTok", value: "tiktok" },
              { name: "X (Twitter)", value: "twitter" },
              { name: "YouTube", value: "youtube" },
            ],
            description: "Filter posts by platform",
          },
          {
            displayName: "Scheduled After",
            name: "scheduled_after",
            type: "dateTime",
            default: "",
            description: "Filter posts scheduled after this date",
          },
        ],
      },
      // Parameters for Profile - Get / GetPlacements / Delete operation
      {
        displayName: "Profile",
        name: "profileId",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        displayOptions: {
          show: {
            resource: ["profile"],
            operation: ["get", "getPlacements", "delete"],
          },
        },
        required: true,
        description: "The profile to get details for",
        modes: [
          {
            displayName: "From List",
            name: "list",
            type: "list",
            typeOptions: {
              searchListMethod: "searchProfiles",
              searchable: true,
            },
          },
          {
            displayName: "By ID",
            name: "id",
            type: "string",
            placeholder: "e.g. yqWUvR",
          },
        ],
      },
      // Simplify option for Profile operations
      {
        displayName: "Simplify",
        name: "simplify",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["profile"],
            operation: ["get", "getMany"],
          },
        },
        default: true,
        description: "Whether to return a simplified version of the response with only the most important fields",
      },
      // Parameters for Profile - Get Many operation
      {
        displayName: "Return All",
        name: "returnAll",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["profile"],
            operation: ["getMany"],
          },
        },
        default: false,
        description: "Whether to return all results or only up to a given limit",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        displayOptions: {
          show: {
            resource: ["profile"],
            operation: ["getMany"],
            returnAll: [false],
          },
        },
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        default: 50,
        description: "Max number of results to return",
      },
      {
        displayName: "Page",
        name: "page",
        type: "number",
        displayOptions: {
          show: {
            resource: ["profile"],
            operation: ["getMany"],
            returnAll: [false],
          },
        },
        typeOptions: {
          minValue: 0,
        },
        default: 0,
        description: "Page number (0-indexed) for pagination",
      },
      {
        displayName: "Per Page",
        name: "per_page",
        type: "number",
        displayOptions: {
          show: {
            resource: ["profile"],
            operation: ["getMany"],
          },
        },
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        default: 10,
        description: "Number of items per page (API pagination parameter)",
      },
      // Parameters for Profile Group - Get Many operation
      {
        displayName: "Return All",
        name: "returnAll",
        type: "boolean",
        displayOptions: {
          show: {
            resource: ["profileGroup"],
            operation: ["getMany"],
          },
        },
        default: false,
        description: "Whether to return all results or only up to a given limit",
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        displayOptions: {
          show: {
            resource: ["profileGroup"],
            operation: ["getMany"],
            returnAll: [false],
          },
        },
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        default: 50,
        description: "Max number of results to return",
      },
      {
        displayName: "Page",
        name: "page",
        type: "number",
        displayOptions: {
          show: {
            resource: ["profileGroup"],
            operation: ["getMany"],
            returnAll: [false],
          },
        },
        typeOptions: {
          minValue: 0,
        },
        default: 0,
        description: "Page number (0-indexed) for pagination",
      },
      {
        displayName: "Per Page",
        name: "per_page",
        type: "number",
        displayOptions: {
          show: {
            resource: ["profileGroup"],
            operation: ["getMany"],
          },
        },
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        default: 10,
        description: "Number of items per page (API pagination parameter)",
      },
    ],
  };

  methods = {
    listSearch: {
      async searchPosts(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        try {
          // Check if current operation is "publish" to filter only draft posts
          let operation: string | undefined;
          try {
            operation = this.getCurrentNodeParameter("operation") as string | undefined;
          } catch {
            try {
              const node = this.getNode();
              operation = node?.parameters?.operation as string | undefined;
            } catch {
              // Operation cannot be determined, continue without filtering
            }
          }

          // Build query parameters
          const queryParams = new URLSearchParams();
          if (operation === "publish") {
            queryParams.append("status", "draft");
          }

          const url = queryParams.toString() 
            ? `${BASE_URL}/posts?${queryParams.toString()}`
            : `${BASE_URL}/posts`;

          const response = await this.helpers.httpRequestWithAuthentication.call(
            this,
            "postProxyApi",
            {
              method: "GET",
              url: url,
              headers: {
                "Content-Type": "application/json",
              },
              json: true,
              timeout: 30000,
            },
          );

          let posts = response.data || response.items || (Array.isArray(response) ? response : []);
          
          // Filter only draft posts if operation is "publish"
          if (operation === "publish") {
            posts = posts.filter((post: any) => {
              // Check both status field and draft field for compatibility
              return post.status === "draft" || post.draft === true;
            });
          }
          
          let results: INodeListSearchItems[] = posts.map((post: any) => {
            // Handle new API format: content field, or legacy post.body format
            const content = post.content || post.post?.body || post.body || "";
            const truncated = content.length > 50 ? content.substring(0, 50) + "..." : content;
            const status = post.status ? ` [${post.status}]` : "";
            const draft = post.draft ? " [draft]" : "";
            
            return {
              name: `${truncated}${status}${draft}`,
              value: post.id != null ? String(post.id) : "",
              url: post.url || undefined,
            };
          });

          // Filter by search term if provided
          if (filter && typeof filter === "string") {
            const filterLower = filter.toLowerCase();
            results = results.filter((item) => 
              item.name.toLowerCase().includes(filterLower) || 
              String(item.value).toLowerCase().includes(filterLower)
            );
          }

          return { results };
        } catch (error: any) {
          throw new NodeApiError(this.getNode(), error, {
            message: "Failed to search posts",
            description: error.message,
          });
        }
      },
      async searchProfiles(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        try {
          const response = await this.helpers.httpRequestWithAuthentication.call(
            this,
            "postProxyApi",
            {
              method: "GET",
              url: `${BASE_URL}/profiles`,
              headers: {
                "Content-Type": "application/json",
              },
              json: true,
              timeout: 30000,
            },
          );

          const profiles = response.data || response.items || (Array.isArray(response) ? response : []);
          
          let results: INodeListSearchItems[] = profiles.map((profile: any) => {
            const profileName = profile.name || profile.username || `Profile ${profile.id}`;
            const platformType = profile.platform || "unknown";
            
            return {
              name: `${profileName} (${platformType})`,
              value: profile.id != null ? String(profile.id) : "",
            };
          });

          // Filter by search term if provided
          if (filter && typeof filter === "string") {
            const filterLower = filter.toLowerCase();
            results = results.filter((item) => 
              item.name.toLowerCase().includes(filterLower) || 
              String(item.value).toLowerCase().includes(filterLower)
            );
          }

          return { results };
        } catch (error: any) {
          throw new NodeApiError(this.getNode(), error, {
            message: "Failed to search profiles",
            description: error.message,
          });
        }
      },
      async searchQueues(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        try {
          const response = await this.helpers.httpRequestWithAuthentication.call(
            this,
            "postProxyApi",
            {
              method: "GET",
              url: `${BASE_URL}/post_queues`,
              headers: { "Content-Type": "application/json" },
              json: true,
              timeout: 30000,
            },
          );

          const queues = response.data || (Array.isArray(response) ? response : []);

          let results: INodeListSearchItems[] = queues.map((queue: any) => {
            const tz = queue.timezone ? ` (${queue.timezone})` : "";
            const paused = queue.enabled === false ? " [paused]" : "";
            return {
              name: `${queue.name}${tz}${paused}`,
              value: queue.id != null ? String(queue.id) : "",
            };
          });

          if (filter && typeof filter === "string") {
            const filterLower = filter.toLowerCase();
            results = results.filter((item) =>
              item.name.toLowerCase().includes(filterLower) ||
              String(item.value).toLowerCase().includes(filterLower)
            );
          }

          return { results };
        } catch (error: any) {
          throw new NodeApiError(this.getNode(), error, {
            message: "Failed to search queues",
            description: error.message,
          });
        }
      },
      async searchProfileGroups(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        try {
          const response = await this.helpers.httpRequestWithAuthentication.call(
            this,
            "postProxyApi",
            {
              method: "GET",
              url: `${BASE_URL}/profile_groups/`,
              headers: {
                "Content-Type": "application/json",
              },
              json: true,
              timeout: 30000,
            },
          );

          const groups = response.data || [];
          
          let results: INodeListSearchItems[] = groups.map((group: any) => ({
            name: group.name || `Group ${group.id}`,
            value: group.id != null ? String(group.id) : "",
          }));

          // Filter by search term if provided
          if (filter && typeof filter === "string") {
            const filterLower = filter.toLowerCase();
            results = results.filter((item) => 
              item.name.toLowerCase().includes(filterLower) || 
              String(item.value).toLowerCase().includes(filterLower)
            );
          }

          return { results };
        } catch (error: any) {
          throw new NodeApiError(this.getNode(), error, {
            message: "Failed to search profile groups",
            description: error.message,
          });
        }
      },
      async searchFacebookPages(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        return searchPlacementsByPlatform.call(this, "facebook", filter);
      },
      async searchLinkedInOrganizations(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        return searchPlacementsByPlatform.call(this, "linkedin", filter);
      },
      async searchPinterestBoards(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        return searchPlacementsByPlatform.call(this, "pinterest", filter);
      },
    },
    loadOptions: {
      async getProfileGroups(
        this: ILoadOptionsFunctions,
      ): Promise<Array<{ name: string; value: string }>> {
        try {
          const response = await this.helpers.httpRequestWithAuthentication.call(
            this,
            "postProxyApi",
            {
              method: "GET",
              url: `${BASE_URL}/profile_groups/`,
              headers: {
                "Content-Type": "application/json",
              },
              json: true,
              timeout: 30000,
            },
          );

          const groups = response.data || [];

          return groups.map((group: any) => ({
            name: group.name || `Group ${group.id}`,
            value: group.id.toString(),
          }));
        } catch (error: any) {
          throw new NodeApiError(this.getNode(), error, {
            message: "Failed to load profile groups",
            description: error.message,
          });
        }
      },
      async getProfilesForGroup(
        this: ILoadOptionsFunctions,
      ): Promise<Array<{ name: string; value: string }>> {
        try {
          // Try to get profileGroupId from node parameters
          let profileGroupId: string | undefined;
          
          try {
            profileGroupId = this.getCurrentNodeParameter("profileGroup") as string | undefined;
          } catch {
            // getCurrentNodeParameter may fail, try alternative methods
            try {
              profileGroupId = this.getNodeParameter("profileGroup", 0) as string | undefined;
            } catch {
              try {
                const node = this.getNode();
                profileGroupId = node?.parameters?.profileGroup as string | undefined;
              } catch {
                // All methods failed, profileGroupId remains undefined
              }
            }
          }

          // Load ALL profiles from API
          // Note: loadOptionsDependOn doesn't reliably pass profileGroup value,
          // so we load all profiles and filter client-side
          const response = await this.helpers.httpRequestWithAuthentication.call(
            this,
            "postProxyApi",
            {
              method: "GET",
              url: `${BASE_URL}/profiles`,
              headers: {
                "Content-Type": "application/json",
              },
              json: true,
              timeout: 30000,
            },
          );

          // Extract profiles from response
          let profiles = response.data || response.items || (Array.isArray(response) ? response : []);

          // Filter by profileGroupId if provided
          if (profileGroupId && profileGroupId !== "") {
            // Extract value from resource locator if needed
            const groupIdValue = typeof profileGroupId === "object" && profileGroupId !== null
              ? extractResourceLocatorValue(profileGroupId)
              : String(profileGroupId);
            
            if (groupIdValue) {
              profiles = profiles.filter((profile: any) => {
                const profileGroupId = String(profile.profile_group_id || "");
                return profileGroupId === groupIdValue;
              });
            }
          }

          // Map profiles to dropdown options
          return profiles.map((profile: any) => {
            const profileName = profile.name || profile.username || `Profile ${profile.id}`;
            const platformType = profile.platform || "unknown";
            const displayName = `${profileName} (${platformType})`;
            const profileId = profile.id != null ? String(profile.id) : "";
            
            return {
              name: displayName,
              value: profileId,
            };
          });
        } catch (error: any) {
          throw new NodeApiError(this.getNode(), error, {
            message: "Failed to load profiles",
            description: error.message,
          });
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const resource = this.getNodeParameter("resource", i) as string;
        const operation = this.getNodeParameter("operation", i) as string;

        let responseData: any;

        // POST RESOURCE
        if (resource === "post") {
          if (operation === "create") {
            const content = this.getNodeParameter("content", i) as string;
            const publishType = this.getNodeParameter("publishType", i) as string;
            const profileGroupRaw = this.getNodeParameter("profileGroup", i);
            const profileGroupId = extractResourceLocatorValue(profileGroupRaw);
            const profiles = this.getNodeParameter("profiles", i) as string[];
            const mediaUrls = this.getNodeParameter("media", i, []) as any;
            const publishAt = this.getNodeParameter("publish_at", i, "") as string | undefined;
            const platformParamsRaw = this.getNodeParameter("platformParams", i, "{}") as string;

            // Validation
            if (!content || content.trim().length === 0) {
              throw new NodeOperationError(
                this.getNode(),
                "Content cannot be empty",
                { 
                  description: `Please provide post content in the 'Content' field. Received: "${content || '(empty)'}"\n\nIf you're using expressions like {{ $json.content }}, make sure:\n1. The previous node outputs data with this field\n2. The field name matches exactly\n3. Try using the expression editor to select the field` 
                }
              );
            }

            if (!profileGroupId) {
              throw new NodeOperationError(
                this.getNode(),
                "Profile Group must be selected",
                { description: "Please select a profile group to publish to." }
              );
            }

            if (!profiles || profiles.length === 0) {
              throw new NodeOperationError(
                this.getNode(),
                "At least one profile must be selected",
                { description: "Please select at least one social media profile to publish to." }
              );
            }

            if (publishType === "schedule" && (!publishAt || publishAt.trim().length === 0)) {
              throw new NodeOperationError(
                this.getNode(),
                "Publish At date is required",
                { description: "When Publish Type is 'Schedule', you must provide a Publish At date." }
              );
            }

            // Build request body according to API specification
            const body: any = {
              post: {
                body: content.trim(),
              },
              profiles: profiles,
            };

            if (publishType === "schedule" && publishAt) {
              body.post.scheduled_at = publishAt.trim();
            }

            // Add draft parameter if creating a draft post
            if (publishType === "draft") {
              body.post.draft = true;
              // Draft posts can optionally have scheduled_at
              if (publishAt && publishAt.trim().length > 0) {
                body.post.scheduled_at = publishAt.trim();
              }
            }

            // Handle media URLs - one URL per field
            if (mediaUrls !== undefined && mediaUrls !== null) {
              // Helper function to extract a single URL from a value
              const extractUrl = (value: any): string | null => {
                if (value === null || value === undefined) {
                  return null;
                }
                
                // If it's already a string, use it
                if (typeof value === "string") {
                  const trimmed = value.trim();
                  return trimmed.length > 0 ? trimmed : null;
                }
                
                // If it's an object with a 'url' property, extract it
                if (typeof value === "object" && value !== null && "url" in value) {
                  const urlValue = (value as any).url;
                  if (typeof urlValue === "string") {
                    const trimmed = urlValue.trim();
                    return trimmed.length > 0 ? trimmed : null;
                  }
                  return null;
                }
                
                // If it's an array, take the first element
                if (Array.isArray(value) && value.length > 0) {
                  return extractUrl(value[0]);
                }
                
                return null;
              };
              
              // Process each field value (multipleValues: true means it's an array)
              const urlsArray: string[] = [];
              const invalidUrls: string[] = [];
              
              const processValue = (value: any) => {
                const url = extractUrl(value);
                if (!url) {
                  return;
                }
                
                // Validate URL format - must start with http:// or https://
                if (url.startsWith("http://") || url.startsWith("https://")) {
                  urlsArray.push(url);
                } else {
                  invalidUrls.push(url);
                }
              };
              
              if (Array.isArray(mediaUrls)) {
                // Multiple fields - process each one
                mediaUrls.forEach(processValue);
              } else {
                // Single field
                processValue(mediaUrls);
              }
              
              if (invalidUrls.length > 0 && urlsArray.length === 0) {
                // All URLs were invalid
                throw new NodeOperationError(
                  this.getNode(),
                  "Invalid media URLs provided",
                  {
                    description: `All media URLs were invalid. URLs must start with http:// or https://\n\nInvalid URLs: ${invalidUrls.join(", ")}\n\nIf you're using expressions like {{ $json.url }}, make sure the field contains a valid URL string. If it's an object, access the URL property explicitly (e.g., {{ $json.media.url }}).`
                  }
                );
              }
              
              if (urlsArray.length > 0) {
                body.media = urlsArray;
              }
            }

            // Parse and add platform parameters if provided
            if (platformParamsRaw && platformParamsRaw.trim() !== "" && platformParamsRaw !== "{}") {
              try {
                const platformParams = typeof platformParamsRaw === "string"
                  ? JSON.parse(platformParamsRaw)
                  : platformParamsRaw;
                if (platformParams && typeof platformParams === "object" && Object.keys(platformParams).length > 0) {
                  body.platforms = platformParams;
                }
              } catch (error) {
                throw new NodeOperationError(
                  this.getNode(),
                  "Invalid Platform Parameters JSON",
                  { description: "Platform Parameters must be valid JSON. Error: " + (error as Error).message }
                );
              }
            }

            // Process per-platform placement fields from Additional Fields collection
            const postAdditionalFields = this.getNodeParameter("postAdditionalFields", i, {}) as any;

            const facebookPageId = extractResourceLocatorValue(postAdditionalFields.facebookPage);
            if (facebookPageId) {
              if (!body.platforms) body.platforms = {};
              if (!body.platforms.facebook) body.platforms.facebook = {};
              body.platforms.facebook.page_id = facebookPageId;
            }

            const linkedinOrgId = extractResourceLocatorValue(postAdditionalFields.linkedinOrganization);
            if (linkedinOrgId) {
              if (!body.platforms) body.platforms = {};
              if (!body.platforms.linkedin) body.platforms.linkedin = {};
              body.platforms.linkedin.organization_id = linkedinOrgId;
            }

            const pinterestBoardId = extractResourceLocatorValue(postAdditionalFields.pinterestBoard);
            if (pinterestBoardId) {
              if (!body.platforms) body.platforms = {};
              if (!body.platforms.pinterest) body.platforms.pinterest = {};
              body.platforms.pinterest.board_id = pinterestBoardId;
            }

            // Add queue parameters if publish type is queue
            if (publishType === "queue") {
              const queueIdForPostRaw = this.getNodeParameter("queueIdForPost", i, { mode: "id", value: "" });
              const queueIdForPost = extractResourceLocatorValue(queueIdForPostRaw);
              if (queueIdForPost && queueIdForPost.trim().length > 0) {
                body.queue_id = queueIdForPost.trim();
              }
              const queuePriority = this.getNodeParameter("queuePriority", i, "medium") as string;
              body.queue_priority = queuePriority;
            }

            // Add thread posts if provided
            const threadPostsRaw = this.getNodeParameter("threadPosts", i, "[]") as string;
            if (threadPostsRaw && threadPostsRaw.trim() !== "" && threadPostsRaw !== "[]") {
              try {
                const threadPosts = typeof threadPostsRaw === "string"
                  ? JSON.parse(threadPostsRaw)
                  : threadPostsRaw;
                if (Array.isArray(threadPosts) && threadPosts.length > 0) {
                  body.thread = threadPosts;
                }
              } catch (error) {
                throw new NodeOperationError(
                  this.getNode(),
                  "Invalid Thread Posts JSON",
                  { description: "Thread Posts must be a valid JSON array. Error: " + (error as Error).message }
                );
              }
            }

            responseData = await makeRequest.call(this, "POST", "/posts", body);
      } else if (operation === "delete") {
        const postIdRaw = this.getNodeParameter("postId", i);
        const postId = extractResourceLocatorValue(postIdRaw);
        
        if (!postId) {
          throw new NodeOperationError(
            this.getNode(),
            "Post ID is required",
            { description: "Please provide a valid Post ID." }
          );
        }
        
        responseData = await makeRequest.call(this, "DELETE", `/posts/${postId}`);
      } else if (operation === "get") {
        const postIdRaw = this.getNodeParameter("postId", i);
        const postId = extractResourceLocatorValue(postIdRaw);
        
        if (!postId) {
          throw new NodeOperationError(
            this.getNode(),
            "Post ID is required",
            { description: "Please provide a valid Post ID." }
          );
        }
        
        responseData = await makeRequest.call(this, "GET", `/posts/${postId}`);
        
        const simplify = this.getNodeParameter("simplify", i, true) as boolean;
        if (simplify && responseData) {
          responseData = simplifyPost(responseData);
        }
      } else if (operation === "getMany") {
        const returnAll = this.getNodeParameter("returnAll", i, false) as boolean;
        const simplify = this.getNodeParameter("simplify", i, true) as boolean;
        
        let allItems: any[] = [];
        let currentPage = 0;
        let total = 0;
        let perPage = 10;
        
        if (!returnAll) {
          currentPage = this.getNodeParameter("page", i, 0) as number;
          perPage = this.getNodeParameter("per_page", i, 10) as number;
        }
        
        const postFilters = this.getNodeParameter("postFilters", i, {}) as any;

        do {
          const queryParams = new URLSearchParams();
          queryParams.append("page", String(currentPage));
          queryParams.append("per_page", String(perPage));

          if (postFilters.status && postFilters.status !== "") {
            queryParams.append("status", postFilters.status);
          }
          if (postFilters.platforms && postFilters.platforms.length > 0) {
            for (const p of postFilters.platforms) {
              queryParams.append("platforms[]", p);
            }
          }
          if (postFilters.scheduled_after && postFilters.scheduled_after.trim().length > 0) {
            queryParams.append("scheduled_after", postFilters.scheduled_after.trim());
          }

          const response = await makeRequest.call(this, "GET", `/posts?${queryParams.toString()}`);

          const items = response.data || response.items || (Array.isArray(response) ? response : []);
          allItems = allItems.concat(items);

          if (returnAll) {
            total = response.total || items.length;
            perPage = response.per_page || perPage;
            currentPage++;
          } else {
            break;
          }
        } while (returnAll && allItems.length < total);
        
        if (!returnAll) {
          const limit = this.getNodeParameter("limit", i, 50) as number;
          allItems = allItems.slice(0, limit);
        }
        
        if (simplify) {
          allItems = allItems.map((post: any) => simplifyPost(post));
        }
        
        responseData = {
          total: returnAll ? total : allItems.length,
          page: returnAll ? 0 : currentPage,
          per_page: perPage,
          data: allItems,
        };
      } else if (operation === "update") {
        const postIdRaw = this.getNodeParameter("postId", i);
        const postId = extractResourceLocatorValue(postIdRaw);
        const updateFields = this.getNodeParameter("updateFields", i, {}) as any;
        
        if (!postId) {
          throw new NodeOperationError(
            this.getNode(),
            "Post ID is required",
            { description: "Please provide a valid Post ID." }
          );
        }
        
        // Build update body
        const body: any = {
          post: {},
        };
        
        if (updateFields.content !== undefined && updateFields.content !== "") {
          body.post.body = updateFields.content;
        }
        
        if (updateFields.scheduled_at !== undefined && updateFields.scheduled_at !== "") {
          body.post.scheduled_at = updateFields.scheduled_at;
        }
        
        // Ensure at least one field is being updated
        if (Object.keys(body.post).length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            "At least one field must be provided to update",
            { description: "Please provide at least one field (Content or Scheduled At) to update the post." }
          );
        }
        
        responseData = await makeRequest.call(this, "PATCH", `/posts/${postId}`, body);
      } else if (operation === "publish") {
        const postIdRaw = this.getNodeParameter("postId", i);
        const postId = extractResourceLocatorValue(postIdRaw);
        
        if (!postId) {
          throw new NodeOperationError(
            this.getNode(),
            "Post ID is required",
            { description: "Please provide a valid Post ID." }
          );
        }
        
        responseData = await makeRequest.call(this, "POST", `/posts/${postId}/publish`);

        const simplify = this.getNodeParameter("simplify", i, true) as boolean;
        if (simplify && responseData) {
          responseData = simplifyPost(responseData);
        }
      } else if (operation === "getStats") {
        const postIds = this.getNodeParameter("postIds", i) as string;
        const statsFilters = this.getNodeParameter("statsFilters", i, {}) as any;

        if (!postIds || postIds.trim().length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            "Post IDs are required",
            { description: "Please provide at least one post ID." }
          );
        }

        const queryParams = new URLSearchParams();
        queryParams.append("post_ids", postIds.trim());

        if (statsFilters.profiles && statsFilters.profiles.trim().length > 0) {
          queryParams.append("profiles", statsFilters.profiles.trim());
        }
        if (statsFilters.from && statsFilters.from.trim().length > 0) {
          queryParams.append("from", statsFilters.from.trim());
        }
        if (statsFilters.to && statsFilters.to.trim().length > 0) {
          queryParams.append("to", statsFilters.to.trim());
        }

        responseData = await makeRequest.call(this, "GET", `/posts/stats?${queryParams.toString()}`);
      }
    }

    // PROFILE RESOURCE
    else if (resource === "profile") {
      if (operation === "delete") {
        const profileIdRaw = this.getNodeParameter("profileId", i);
        const profileId = extractResourceLocatorValue(profileIdRaw);

        if (!profileId) {
          throw new NodeOperationError(
            this.getNode(),
            "Profile ID is required",
            { description: "Please provide a valid Profile ID." }
          );
        }

        responseData = await makeRequest.call(this, "DELETE", `/profiles/${profileId}`);
      } else if (operation === "get") {
        const profileIdRaw = this.getNodeParameter("profileId", i);
        const profileId = extractResourceLocatorValue(profileIdRaw);

        if (!profileId) {
          throw new NodeOperationError(
            this.getNode(),
            "Profile ID is required",
            { description: "Please provide a valid Profile ID." }
          );
        }

        responseData = await makeRequest.call(this, "GET", `/profiles/${profileId}`);

        const simplify = this.getNodeParameter("simplify", i, true) as boolean;
        if (simplify && responseData) {
          responseData = simplifyProfile(responseData);
        }
      } else if (operation === "getPlacements") {
        const profileIdRaw = this.getNodeParameter("profileId", i);
        const profileId = extractResourceLocatorValue(profileIdRaw);

        if (!profileId) {
          throw new NodeOperationError(
            this.getNode(),
            "Profile ID is required",
            { description: "Please provide a valid Profile ID." }
          );
        }

        const response = await makeRequest.call(this, "GET", `/profiles/${profileId}/placements`);
        responseData = {
          placements: Array.isArray(response) ? response : (response.placements || response.data || []),
        };
      } else if (operation === "getMany") {
        const returnAll = this.getNodeParameter("returnAll", i, false) as boolean;
        const simplify = this.getNodeParameter("simplify", i, true) as boolean;

        let allItems: any[] = [];
        let currentPage = 0;
        let total = 0;
        let perPage = 10;

        if (!returnAll) {
          currentPage = this.getNodeParameter("page", i, 0) as number;
          perPage = this.getNodeParameter("per_page", i, 10) as number;
        }

        do {
          const queryParams = new URLSearchParams();
          queryParams.append("page", String(currentPage));
          queryParams.append("per_page", String(perPage));

          const response = await makeRequest.call(this, "GET", `/profiles?${queryParams.toString()}`);

          const items = response.data || response.items || (Array.isArray(response) ? response : []);
          allItems = allItems.concat(items);
          
          if (returnAll) {
            total = response.total || items.length;
            perPage = response.per_page || perPage;
            currentPage++;
          } else {
            break;
          }
        } while (returnAll && allItems.length < total);
        
        if (!returnAll) {
          const limit = this.getNodeParameter("limit", i, 50) as number;
          allItems = allItems.slice(0, limit);
        }
        
        if (simplify) {
          allItems = allItems.map((profile: any) => simplifyProfile(profile));
        }
        
        responseData = {
          total: returnAll ? total : allItems.length,
          page: returnAll ? 0 : currentPage,
          per_page: perPage,
          data: allItems,
        };
      }
    }

    // QUEUE RESOURCE
    else if (resource === "queue") {
      if (operation === "list") {
        responseData = await makeRequest.call(this, "GET", "/post_queues");
      } else if (operation === "get") {
        const queueId = this.getNodeParameter("queueId", i) as string;
        if (!queueId || queueId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Queue ID is required", {});
        }
        responseData = await makeRequest.call(this, "GET", `/post_queues/${queueId.trim()}`);
      } else if (operation === "nextSlot") {
        const queueId = this.getNodeParameter("queueId", i) as string;
        if (!queueId || queueId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Queue ID is required", {});
        }
        responseData = await makeRequest.call(this, "GET", `/post_queues/${queueId.trim()}/next_slot`);
      } else if (operation === "create") {
        const profileGroupId = this.getNodeParameter("queueProfileGroupId", i) as string;
        const name = this.getNodeParameter("queueName", i) as string;
        const createFields = this.getNodeParameter("queueCreateFields", i, {}) as any;

        if (!profileGroupId || profileGroupId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Profile Group ID is required", {});
        }
        if (!name || name.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Queue name is required", {});
        }

        const postQueue: any = { name: name.trim() };
        if (createFields.description && createFields.description.trim().length > 0) {
          postQueue.description = createFields.description.trim();
        }
        if (createFields.timezone && createFields.timezone.trim().length > 0) {
          postQueue.timezone = createFields.timezone.trim();
        }
        if (createFields.jitter !== undefined) {
          postQueue.jitter = createFields.jitter;
        }
        if (createFields.timeslots && createFields.timeslots !== "[]") {
          try {
            const timeslots = typeof createFields.timeslots === "string"
              ? JSON.parse(createFields.timeslots)
              : createFields.timeslots;
            if (Array.isArray(timeslots) && timeslots.length > 0) {
              postQueue.queue_timeslots_attributes = timeslots;
            }
          } catch (error) {
            throw new NodeOperationError(
              this.getNode(),
              "Invalid Timeslots JSON",
              { description: "Timeslots must be a valid JSON array. Error: " + (error as Error).message }
            );
          }
        }

        const body = {
          profile_group_id: profileGroupId.trim(),
          post_queue: postQueue,
        };

        responseData = await makeRequest.call(this, "POST", "/post_queues", body);
      } else if (operation === "update") {
        const queueId = this.getNodeParameter("queueId", i) as string;
        const updateFields = this.getNodeParameter("queueUpdateFields", i, {}) as any;

        if (!queueId || queueId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Queue ID is required", {});
        }

        const postQueue: any = {};
        if (updateFields.name && updateFields.name.trim().length > 0) {
          postQueue.name = updateFields.name.trim();
        }
        if (updateFields.description !== undefined && updateFields.description !== "") {
          postQueue.description = updateFields.description;
        }
        if (updateFields.timezone && updateFields.timezone.trim().length > 0) {
          postQueue.timezone = updateFields.timezone.trim();
        }
        if (updateFields.enabled !== undefined) {
          postQueue.enabled = updateFields.enabled;
        }
        if (updateFields.jitter !== undefined) {
          postQueue.jitter = updateFields.jitter;
        }
        if (updateFields.timeslots && updateFields.timeslots !== "[]") {
          try {
            const timeslots = typeof updateFields.timeslots === "string"
              ? JSON.parse(updateFields.timeslots)
              : updateFields.timeslots;
            if (Array.isArray(timeslots) && timeslots.length > 0) {
              postQueue.queue_timeslots_attributes = timeslots;
            }
          } catch (error) {
            throw new NodeOperationError(
              this.getNode(),
              "Invalid Timeslots JSON",
              { description: "Timeslots must be a valid JSON array. Error: " + (error as Error).message }
            );
          }
        }

        if (Object.keys(postQueue).length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            "At least one field must be provided to update",
            { description: "Please provide at least one field to update the queue." }
          );
        }

        responseData = await makeRequest.call(this, "PATCH", `/post_queues/${queueId.trim()}`, { post_queue: postQueue });
      } else if (operation === "delete") {
        const queueId = this.getNodeParameter("queueId", i) as string;
        if (!queueId || queueId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Queue ID is required", {});
        }
        responseData = await makeRequest.call(this, "DELETE", `/post_queues/${queueId.trim()}`);
      }
    }

    // WEBHOOK RESOURCE
    else if (resource === "webhook") {
      if (operation === "list") {
        responseData = await makeRequest.call(this, "GET", "/webhooks");
      } else if (operation === "get") {
        const webhookId = this.getNodeParameter("webhookId", i) as string;
        if (!webhookId || webhookId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Webhook ID is required", {});
        }
        responseData = await makeRequest.call(this, "GET", `/webhooks/${webhookId.trim()}`);
      } else if (operation === "create") {
        const url = this.getNodeParameter("webhookUrl", i) as string;
        const events = this.getNodeParameter("webhookEvents", i) as string[];
        const description = this.getNodeParameter("webhookDescription", i, "") as string;

        if (!url || url.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "URL is required", {});
        }
        if (!events || events.length === 0) {
          throw new NodeOperationError(this.getNode(), "At least one event must be selected", {});
        }

        const body: any = {
          url: url.trim(),
          events,
        };
        if (description && description.trim().length > 0) {
          body.description = description.trim();
        }

        responseData = await makeRequest.call(this, "POST", "/webhooks", body);
      } else if (operation === "update") {
        const webhookId = this.getNodeParameter("webhookId", i) as string;
        const updateFields = this.getNodeParameter("webhookUpdateFields", i, {}) as any;

        if (!webhookId || webhookId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Webhook ID is required", {});
        }

        const body: any = {};
        if (updateFields.url && updateFields.url.trim().length > 0) {
          body.url = updateFields.url.trim();
        }
        if (updateFields.events && updateFields.events.length > 0) {
          body.events = updateFields.events;
        }
        if (updateFields.enabled !== undefined) {
          body.enabled = updateFields.enabled;
        }
        if (updateFields.description !== undefined && updateFields.description !== "") {
          body.description = updateFields.description;
        }

        if (Object.keys(body).length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            "At least one field must be provided to update",
            { description: "Please provide at least one field to update the webhook." }
          );
        }

        responseData = await makeRequest.call(this, "PATCH", `/webhooks/${webhookId.trim()}`, body);
      } else if (operation === "delete") {
        const webhookId = this.getNodeParameter("webhookId", i) as string;
        if (!webhookId || webhookId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Webhook ID is required", {});
        }
        responseData = await makeRequest.call(this, "DELETE", `/webhooks/${webhookId.trim()}`);
      } else if (operation === "listDeliveries") {
        const webhookId = this.getNodeParameter("webhookId", i) as string;
        const returnAll = this.getNodeParameter("returnAll", i, false) as boolean;

        if (!webhookId || webhookId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Webhook ID is required", {});
        }

        let allItems: any[] = [];
        let currentPage = 0;
        let total = 0;
        let perPage = 20;

        if (!returnAll) {
          perPage = this.getNodeParameter("limit", i, 20) as number;
        }

        do {
          const queryParams = new URLSearchParams();
          queryParams.append("page", String(currentPage));
          queryParams.append("per_page", String(perPage));

          const response = await makeRequest.call(this, "GET", `/webhooks/${webhookId.trim()}/deliveries?${queryParams.toString()}`);

          const items = response.data || (Array.isArray(response) ? response : []);
          allItems = allItems.concat(items);

          if (returnAll) {
            total = response.total || items.length;
            perPage = response.per_page || perPage;
            currentPage++;
          } else {
            break;
          }
        } while (returnAll && allItems.length < total);

        responseData = {
          total: returnAll ? total : allItems.length,
          page: returnAll ? 0 : currentPage,
          per_page: perPage,
          data: allItems,
        };
      }
    }

    // COMMENT RESOURCE
    else if (resource === "comment") {
      const commentPostId = this.getNodeParameter("commentPostId", i) as string;
      const commentProfileId = this.getNodeParameter("commentProfileId", i) as string;

      if (!commentPostId || commentPostId.trim().length === 0) {
        throw new NodeOperationError(
          this.getNode(),
          "Post ID is required",
          { description: "Please provide a valid Post ID." }
        );
      }
      if (!commentProfileId || commentProfileId.trim().length === 0) {
        throw new NodeOperationError(
          this.getNode(),
          "Profile ID is required",
          { description: "Please provide a valid Profile ID." }
        );
      }

      const postId = commentPostId.trim();
      const profileId = commentProfileId.trim();

      if (operation === "list") {
        const returnAll = this.getNodeParameter("returnAll", i, false) as boolean;
        let allItems: any[] = [];
        let currentPage = 0;
        let total = 0;
        let perPage = 20;

        if (!returnAll) {
          currentPage = this.getNodeParameter("page", i, 0) as number;
          perPage = this.getNodeParameter("limit", i, 20) as number;
        }

        do {
          const queryParams = new URLSearchParams();
          queryParams.append("profile_id", profileId);
          queryParams.append("page", String(currentPage));
          queryParams.append("per_page", String(perPage));

          const response = await makeRequest.call(this, "GET", `/posts/${postId}/comments?${queryParams.toString()}`);

          const items = response.data || (Array.isArray(response) ? response : []);
          allItems = allItems.concat(items);

          if (returnAll) {
            total = response.total || items.length;
            perPage = response.per_page || perPage;
            currentPage++;
          } else {
            break;
          }
        } while (returnAll && allItems.length < total);

        responseData = {
          total: returnAll ? total : allItems.length,
          page: returnAll ? 0 : currentPage,
          per_page: perPage,
          data: allItems,
        };
      } else if (operation === "get") {
        const commentId = this.getNodeParameter("commentId", i) as string;
        if (!commentId || commentId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Comment ID is required", {});
        }
        const queryParams = new URLSearchParams();
        queryParams.append("profile_id", profileId);
        responseData = await makeRequest.call(this, "GET", `/posts/${postId}/comments/${commentId.trim()}?${queryParams.toString()}`);
      } else if (operation === "create") {
        const text = this.getNodeParameter("commentText", i) as string;
        const parentId = this.getNodeParameter("commentParentId", i, "") as string;

        if (!text || text.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Comment text is required", {});
        }

        const body: any = {
          profile_id: profileId,
          text: text.trim(),
        };
        if (parentId && parentId.trim().length > 0) {
          body.parent_id = parentId.trim();
        }

        responseData = await makeRequest.call(this, "POST", `/posts/${postId}/comments`, body);
      } else if (operation === "delete") {
        const commentId = this.getNodeParameter("commentId", i) as string;
        if (!commentId || commentId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Comment ID is required", {});
        }
        const body = { profile_id: profileId };
        responseData = await makeRequest.call(this, "DELETE", `/posts/${postId}/comments/${commentId.trim()}`, body);
      } else if (operation === "hide") {
        const commentId = this.getNodeParameter("commentId", i) as string;
        if (!commentId || commentId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Comment ID is required", {});
        }
        const body = { profile_id: profileId };
        responseData = await makeRequest.call(this, "POST", `/posts/${postId}/comments/${commentId.trim()}/hide`, body);
      } else if (operation === "unhide") {
        const commentId = this.getNodeParameter("commentId", i) as string;
        if (!commentId || commentId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Comment ID is required", {});
        }
        const body = { profile_id: profileId };
        responseData = await makeRequest.call(this, "POST", `/posts/${postId}/comments/${commentId.trim()}/unhide`, body);
      } else if (operation === "like") {
        const commentId = this.getNodeParameter("commentId", i) as string;
        if (!commentId || commentId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Comment ID is required", {});
        }
        const body = { profile_id: profileId };
        responseData = await makeRequest.call(this, "PUT", `/posts/${postId}/comments/${commentId.trim()}/like`, body);
      } else if (operation === "unlike") {
        const commentId = this.getNodeParameter("commentId", i) as string;
        if (!commentId || commentId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Comment ID is required", {});
        }
        const body = { profile_id: profileId };
        responseData = await makeRequest.call(this, "POST", `/posts/${postId}/comments/${commentId.trim()}/unlike`, body);
      }
    }

    // PROFILE GROUP RESOURCE
    else if (resource === "profileGroup") {
      if (operation === "get") {
        const pgId = this.getNodeParameter("profileGroupId", i) as string;
        if (!pgId || pgId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Profile Group ID is required", {});
        }
        responseData = await makeRequest.call(this, "GET", `/profile_groups/${pgId.trim()}`);
      } else if (operation === "create") {
        const name = this.getNodeParameter("profileGroupName", i) as string;
        if (!name || name.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Name is required", {});
        }
        responseData = await makeRequest.call(this, "POST", "/profile_groups", {
          profile_group: { name: name.trim() },
        });
      } else if (operation === "delete") {
        const pgId = this.getNodeParameter("profileGroupId", i) as string;
        if (!pgId || pgId.trim().length === 0) {
          throw new NodeOperationError(this.getNode(), "Profile Group ID is required", {});
        }
        responseData = await makeRequest.call(this, "DELETE", `/profile_groups/${pgId.trim()}`);
      } else if (operation === "getMany") {
        const returnAll = this.getNodeParameter("returnAll", i, false) as boolean;
        
        let allItems: any[] = [];
        let currentPage = 0;
        let total = 0;
        let perPage = 10;
        
        if (!returnAll) {
          currentPage = this.getNodeParameter("page", i, 0) as number;
          perPage = this.getNodeParameter("per_page", i, 10) as number;
        }
        
        do {
          const queryParams = new URLSearchParams();
          queryParams.append("page", String(currentPage));
          queryParams.append("per_page", String(perPage));
          
          const response = await makeRequest.call(this, "GET", `/profile_groups/?${queryParams.toString()}`);
          
          const items = response.data || response.items || (Array.isArray(response) ? response : []);
          allItems = allItems.concat(items);
          
          if (returnAll) {
            total = response.total || items.length;
            perPage = response.per_page || perPage;
            currentPage++;
          } else {
            break;
          }
        } while (returnAll && allItems.length < total);
        
        if (!returnAll) {
          const limit = this.getNodeParameter("limit", i, 50) as number;
          allItems = allItems.slice(0, limit);
        }
        
        responseData = {
          total: returnAll ? total : allItems.length,
          page: returnAll ? 0 : currentPage,
          per_page: perPage,
          data: allItems,
        };
      }
    }

        if (responseData === undefined) {
          throw new NodeOperationError(
            this.getNode(),
            `The operation "${operation}" for resource "${resource}" is not supported`,
            { description: "This combination of resource and operation is not available." }
          );
        }

        // Add pairedItem to the response
        returnData.push({
          json: responseData,
          pairedItem: { item: i },
        });
      } catch (error) {
        // Handle errors with continue on fail support
        if (this.continueOnFail()) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorDescription = error instanceof NodeApiError || error instanceof NodeOperationError
            ? error.description || errorMessage
            : errorMessage;
          
          returnData.push({
            json: {
              error: errorMessage,
              description: errorDescription,
            },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
