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

interface PostProxyError {
  message?: string;
  error?: string;
  request_id?: string;
}

// Helper function to simplify post response
function simplifyPost(post: any): any {
  // Handle both response formats: 
  // - API GET /posts/{id} returns: {id, content, created_at, networks: [{network, status, attempted_at}]}
  // - API POST /posts returns: {id, post: {body, scheduled_at}, status, accounts: [...]}
  
  const content = post.content || post.post?.body || post.body || "";
  const networks = post.networks || post.accounts || [];
  
  const result: any = {
    id: post.id,
    content: content,
    created_at: post.created_at,
  };
  
  // Add optional fields only if they exist
  if (post.status !== undefined) {
    result.status = post.status;
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
  
  // Map both 'networks' and 'accounts' formats
  result.network_statuses = networks.map((item: any) => {
    const mapped: any = {
      network: item.network || item.type,
      status: item.status,
    };
    
    // Add optional fields only if they exist
    if (item.attempted_at !== undefined) {
      mapped.attempted_at = item.attempted_at;
    }
    
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
  
  return result;
}

// Helper function to simplify profile response
function simplifyProfile(profile: any): any {
  return {
    id: profile.id,
    name: profile.name || profile.username,
    network: profile.network || profile.type,
    profile_group_id: profile.profile_group_id,
    status: profile.status,
    created_at: profile.created_at,
  };
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

async function makeRequest(
  this: IExecuteFunctions,
  method: IHttpRequestMethods,
  endpoint: string,
  body?: any,
): Promise<any> {
  const credentials = await this.getCredentials("postProxyApi");

  try {
    const response = await this.helpers.httpRequest({
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
      json: true,
      timeout: 30000,
    });

    // Log request_id if present in response headers
    const requestId = (response.headers || {})["x-request-id"];
    if (requestId) {
      this.logger?.info(`PostProxy request_id: ${requestId}`);
    }

    return response;
  } catch (error: any) {
    const statusCode = error.statusCode || error.response?.status;
    const requestId = error.response?.headers?.["x-request-id"];

    let errorMessage = "PostProxy API request failed";
    let description = "";

    if (requestId) {
      this.logger?.error(`PostProxy request_id: ${requestId}`);
      description += `Request ID: ${requestId}\n`;
    }

    if (statusCode) {
      const errorBody: PostProxyError = error.response?.body || {};
      const apiMessage = errorBody.message || errorBody.error || error.message;

      if (statusCode >= 400 && statusCode < 500) {
        errorMessage = `PostProxy API error (${statusCode})`;
        description += apiMessage || "Client error";
        
        if (statusCode === 401) {
          description += "\n\nPlease check your API credentials.";
        } else if (statusCode === 404) {
          description += "\n\nThe requested resource was not found.";
        } else if (statusCode === 429) {
          description += "\n\nRate limit exceeded. Please try again later.";
        }
      } else if (statusCode >= 500) {
        errorMessage = `PostProxy API server error (${statusCode})`;
        description += apiMessage || "Internal server error";
        description += "\n\nPlease try again later or contact PostProxy support.";
      }
    } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
      errorMessage = "PostProxy API request timed out";
      description = "The request took too long to complete. Please try again.";
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      errorMessage = "PostProxy API connection failed";
      description = "Could not connect to PostProxy API. Please check your network connection.";
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
        ],
        default: "post",
        description: "The resource to operate on",
      },
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
            name: "Get Profile Details",
            value: "get",
            description: "Get a profile by ID",
            action: "Get profile details",
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
            name: "List Profile Groups",
            value: "getMany",
            description: "Get many profile groups",
            action: "List profile groups",
          },
        ],
        default: "getMany",
        description: "The operation to perform",
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
        ],
        default: "publish_now",
        description: "When to publish the post",
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
            placeholder: "e.g. 123",
            validation: [
              {
                type: "regex",
                properties: {
                  regex: "^[0-9]+$",
                  errorMessage: "Profile Group ID must be a number",
                },
              },
            ],
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
        },
        required: false,
        description:
          "Array of media URLs (images or videos) to attach to the post",
        default: [],
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
            placeholder: "e.g. 12345",
            validation: [
              {
                type: "regex",
                properties: {
                  regex: "^[0-9]+$",
                  errorMessage: "Post ID must be a number",
                },
              },
            ],
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
            placeholder: "e.g. 12345",
            validation: [
              {
                type: "regex",
                properties: {
                  regex: "^[0-9]+$",
                  errorMessage: "Post ID must be a number",
                },
              },
            ],
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
            placeholder: "e.g. 12345",
            validation: [
              {
                type: "regex",
                properties: {
                  regex: "^[0-9]+$",
                  errorMessage: "Post ID must be a number",
                },
              },
            ],
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
      // Parameters for Profile - Get operation
      {
        displayName: "Profile",
        name: "profileId",
        type: "resourceLocator",
        default: { mode: "list", value: "" },
        displayOptions: {
          show: {
            resource: ["profile"],
            operation: ["get"],
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
            placeholder: "e.g. 12345",
            validation: [
              {
                type: "regex",
                properties: {
                  regex: "^[0-9]+$",
                  errorMessage: "Profile ID must be a number",
                },
              },
            ],
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
    ],
  };

  methods = {
    listSearch: {
      async searchPosts(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        const credentials = await this.getCredentials("postProxyApi");
        try {
          const response = await this.helpers.httpRequest({
            method: "GET",
            url: `${BASE_URL}/posts`,
            headers: {
              Authorization: `Bearer ${credentials.apiKey}`,
              "Content-Type": "application/json",
            },
            json: true,
            timeout: 30000,
          });

          const posts = response.data || response.items || (Array.isArray(response) ? response : []);
          
          let results: INodeListSearchItems[] = posts.map((post: any) => {
            const content = post.post?.body || post.body || "";
            const truncated = content.length > 50 ? content.substring(0, 50) + "..." : content;
            const status = post.status ? ` [${post.status}]` : "";
            
            return {
              name: `${truncated}${status}`,
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
        const credentials = await this.getCredentials("postProxyApi");
        try {
          const response = await this.helpers.httpRequest({
            method: "GET",
            url: `${BASE_URL}/profiles`,
            headers: {
              Authorization: `Bearer ${credentials.apiKey}`,
              "Content-Type": "application/json",
            },
            json: true,
            timeout: 30000,
          });

          const profiles = response.data || response.items || (Array.isArray(response) ? response : []);
          
          let results: INodeListSearchItems[] = profiles.map((profile: any) => {
            const profileName = profile.name || profile.username || `Profile ${profile.id}`;
            const platformType = profile.network || profile.type || "unknown";
            
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
      async searchProfileGroups(
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        const credentials = await this.getCredentials("postProxyApi");
        try {
          const response = await this.helpers.httpRequest({
            method: "GET",
            url: `${BASE_URL}/profile_groups/`,
            headers: {
              Authorization: `Bearer ${credentials.apiKey}`,
              "Content-Type": "application/json",
            },
            json: true,
            timeout: 30000,
          });

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
    },
    loadOptions: {
      async getProfileGroups(
        this: ILoadOptionsFunctions,
      ): Promise<Array<{ name: string; value: string }>> {
        const credentials = await this.getCredentials("postProxyApi");

        try {
          const response = await this.helpers.httpRequest({
            method: "GET",
            url: `${BASE_URL}/profile_groups/`,
            headers: {
              Authorization: `Bearer ${credentials.apiKey}`,
              "Content-Type": "application/json",
            },
            json: true,
            timeout: 30000,
          });

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
          const credentials = await this.getCredentials("postProxyApi");
          
          // Try to get profileGroupId from node parameters
          let profileGroupId: string | undefined;
          
          try {
            profileGroupId = this.getCurrentNodeParameter("profileGroup") as string | undefined;
          } catch (e: any) {
            // getCurrentNodeParameter may fail, try alternative methods
            try {
              profileGroupId = this.getNodeParameter("profileGroup", 0) as string | undefined;
            } catch (e2: any) {
              try {
                const node = this.getNode();
                profileGroupId = node?.parameters?.profileGroup as string | undefined;
              } catch (e3: any) {
                // All methods failed, profileGroupId remains undefined
              }
            }
          }

          // Load ALL profiles from API
          // Note: loadOptionsDependOn doesn't reliably pass profileGroup value,
          // so we load all profiles and filter client-side
          const response = await this.helpers.httpRequest({
            method: "GET",
            url: `${BASE_URL}/profiles`,
            headers: {
              Authorization: `Bearer ${credentials.apiKey}`,
              "Content-Type": "application/json",
            },
            json: true,
            timeout: 30000,
          });

          // Extract profiles from response
          let profiles = response.data || response.items || (Array.isArray(response) ? response : []);

          // Filter by profileGroupId if provided
          if (profileGroupId && profileGroupId !== "") {
            const groupIdNum = parseInt(profileGroupId, 10);
            if (!isNaN(groupIdNum)) {
              profiles = profiles.filter((profile: any) => profile.profile_group_id === groupIdNum);
            }
          }

          // Map profiles to dropdown options
          return profiles.map((profile: any) => {
            const profileName = profile.name || profile.username || `Profile ${profile.id}`;
            const platformType = profile.network || profile.type || "unknown";
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
    const resource = this.getNodeParameter("resource", 0) as string;
    const operation = this.getNodeParameter("operation", 0) as string;

    let responseData: any;

    // POST RESOURCE
    if (resource === "post") {
      if (operation === "create") {
        const content = this.getNodeParameter("content", 0) as string;
        const publishType = this.getNodeParameter("publishType", 0) as string;
        const profileGroupRaw = this.getNodeParameter("profileGroup", 0);
        const profileGroupId = extractResourceLocatorValue(profileGroupRaw);
        const profiles = this.getNodeParameter("profiles", 0) as string[];
        const mediaUrls = this.getNodeParameter("media", 0, []) as
          | string[]
          | undefined;
        const publishAt = this.getNodeParameter("publish_at", 0, "") as string | undefined;

        // Validation
        if (!content || content.trim().length === 0) {
          throw new NodeOperationError(
            this.getNode(),
            "Content cannot be empty",
            { description: "Please provide post content in the 'Content' field." }
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
          profile_group_id: parseInt(profileGroupId),
          profiles: profiles,
        };

        if (publishType === "schedule" && publishAt) {
          body.post.scheduled_at = publishAt.trim();
        }

        if (mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0) {
          const filteredUrls = mediaUrls
            .filter(
              (url) => url && typeof url === "string" && url.trim().length > 0,
            )
            .map((url) => url.trim());
          if (filteredUrls.length > 0) {
            body.media = filteredUrls;
          }
        }

        responseData = await makeRequest.call(this, "POST", "/posts", body);
      } else if (operation === "delete") {
        const postIdRaw = this.getNodeParameter("postId", 0);
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
        const postIdRaw = this.getNodeParameter("postId", 0);
        const postId = extractResourceLocatorValue(postIdRaw);
        
        if (!postId) {
          throw new NodeOperationError(
            this.getNode(),
            "Post ID is required",
            { description: "Please provide a valid Post ID." }
          );
        }
        
        responseData = await makeRequest.call(this, "GET", `/posts/${postId}`);
        
        const simplify = this.getNodeParameter("simplify", 0, true) as boolean;
        if (simplify && responseData) {
          responseData = simplifyPost(responseData);
        }
      } else if (operation === "getMany") {
        const returnAll = this.getNodeParameter("returnAll", 0, false) as boolean;
        const simplify = this.getNodeParameter("simplify", 0, true) as boolean;
        
        responseData = await makeRequest.call(this, "GET", "/posts");

        let items = responseData.data || responseData.items || (Array.isArray(responseData) ? responseData : []);
        
        if (!returnAll) {
          const limit = this.getNodeParameter("limit", 0, 50) as number;
          items = items.slice(0, limit);
        }
        
        if (simplify) {
          items = items.map((post: any) => simplifyPost(post));
        }
        
        responseData = {
          ...responseData,
          data: items,
        };
      } else if (operation === "update") {
        const postIdRaw = this.getNodeParameter("postId", 0);
        const postId = extractResourceLocatorValue(postIdRaw);
        const updateFields = this.getNodeParameter("updateFields", 0, {}) as any;
        
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
      }
    }

    // PROFILE RESOURCE
    else if (resource === "profile") {
      if (operation === "get") {
        const profileIdRaw = this.getNodeParameter("profileId", 0);
        const profileId = extractResourceLocatorValue(profileIdRaw);
        
        if (!profileId) {
          throw new NodeOperationError(
            this.getNode(),
            "Profile ID is required",
            { description: "Please provide a valid Profile ID." }
          );
        }
        
        responseData = await makeRequest.call(this, "GET", `/profiles/${profileId}`);
        
        const simplify = this.getNodeParameter("simplify", 0, true) as boolean;
        if (simplify && responseData) {
          responseData = simplifyProfile(responseData);
        }
      } else if (operation === "getMany") {
        const returnAll = this.getNodeParameter("returnAll", 0, false) as boolean;
        const simplify = this.getNodeParameter("simplify", 0, true) as boolean;
        
        responseData = await makeRequest.call(this, "GET", "/profiles");

        let items = responseData.data || responseData.items || (Array.isArray(responseData) ? responseData : []);
        
        if (!returnAll) {
          const limit = this.getNodeParameter("limit", 0, 50) as number;
          items = items.slice(0, limit);
        }
        
        if (simplify) {
          items = items.map((profile: any) => simplifyProfile(profile));
        }
        
        responseData = {
          ...responseData,
          data: items,
        };
      }
    }

    // PROFILE GROUP RESOURCE
    else if (resource === "profileGroup") {
      if (operation === "getMany") {
        const returnAll = this.getNodeParameter("returnAll", 0, false) as boolean;
        responseData = await makeRequest.call(this, "GET", "/profile_groups/");

        if (!returnAll) {
          const limit = this.getNodeParameter("limit", 0, 50) as number;
          const items = responseData.data || responseData.items || (Array.isArray(responseData) ? responseData : []);
          responseData = {
            ...responseData,
            data: items.slice(0, limit),
          };
        }
      }
    }

    if (responseData === undefined) {
      throw new NodeOperationError(
        this.getNode(),
        `The operation "${operation}" for resource "${resource}" is not supported`,
        { description: "This combination of resource and operation is not available." }
      );
    }

    return [
      [
        {
          json: responseData,
        },
      ],
    ];
  }
}
