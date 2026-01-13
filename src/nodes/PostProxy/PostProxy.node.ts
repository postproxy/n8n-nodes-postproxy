import {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IHttpRequestMethods,
} from "n8n-workflow";

const BASE_URL = "https://api.postproxy.dev/api";

interface PostProxyError {
  message?: string;
  error?: string;
  request_id?: string;
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

    if (requestId) {
      this.logger?.error(`PostProxy request_id: ${requestId}`);
      errorMessage += ` (request_id: ${requestId})`;
    }

    if (statusCode) {
      const errorBody: PostProxyError = error.response?.body || {};
      const apiMessage = errorBody.message || errorBody.error || error.message;

      if (statusCode >= 400 && statusCode < 500) {
        errorMessage = `PostProxy API error (${statusCode}): ${apiMessage}`;
      } else if (statusCode >= 500) {
        errorMessage = `PostProxy API server error (${statusCode}): ${apiMessage || "Internal server error"}`;
      }
    } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
      errorMessage = "PostProxy API request timed out";
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      errorMessage =
        "PostProxy API connection failed. Please check your network connection.";
    }

    throw new Error(errorMessage);
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
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        typeOptions: {
          loadOptionsMethod: "getProfileGroups",
        },
        required: true,
        default: '',
        placeholder: "Select a group",
        description: "Select the profile group to publish to",
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
        displayName: "Post ID",
        name: "postId",
        type: "string",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["get"],
          },
        },
        required: true,
        default: "",
        description: "The ID of the post",
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
        displayName: "Profile ID",
        name: "profileId",
        type: "string",
        displayOptions: {
          show: {
            resource: ["profile"],
            operation: ["get"],
          },
        },
        required: true,
        default: "",
        description: "The ID of the profile",
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
          throw new Error(`Failed to load profile groups: ${error.message}`);
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
          throw new Error(`Failed to load profiles: ${error.message}`);
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
        const profileGroupId = this.getNodeParameter("profileGroup", 0) as string;
        const profiles = this.getNodeParameter("profiles", 0) as string[];
        const mediaUrls = this.getNodeParameter("media", 0, []) as
          | string[]
          | undefined;
        const publishAt = this.getNodeParameter("publish_at", 0, "") as string | undefined;

        // Validation
        if (!content || content.trim().length === 0) {
          throw new Error("Content cannot be empty");
        }

        if (!profileGroupId) {
          throw new Error("Profile Group must be selected");
        }

        if (!profiles || profiles.length === 0) {
          throw new Error("At least one profile (platform) must be selected");
        }

        if (publishType === "schedule" && (!publishAt || publishAt.trim().length === 0)) {
          throw new Error("Publish At date is required when Publish Type is 'Schedule'");
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
      } else if (operation === "get") {
        const postId = this.getNodeParameter("postId", 0) as string;
        responseData = await makeRequest.call(this, "GET", `/posts/${postId}`);
      } else if (operation === "getMany") {
        const returnAll = this.getNodeParameter("returnAll", 0, false) as boolean;
        responseData = await makeRequest.call(this, "GET", "/posts");

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

    // PROFILE RESOURCE
    else if (resource === "profile") {
      if (operation === "get") {
        const profileId = this.getNodeParameter("profileId", 0) as string;
        responseData = await makeRequest.call(this, "GET", `/profiles/${profileId}`);
      } else if (operation === "getMany") {
        const returnAll = this.getNodeParameter("returnAll", 0, false) as boolean;
        responseData = await makeRequest.call(this, "GET", "/profiles");

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
      throw new Error(`The operation "${operation}" for resource "${resource}" is not supported`);
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
