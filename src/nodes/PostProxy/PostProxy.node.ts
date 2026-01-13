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
      "Unified API for publishing and scheduling posts across multiple social media platforms",
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
        displayName: "Publish Type",
        name: "publishType",
        type: "options",
        noDataExpression: true,
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
        typeOptions: {
          multipleValues: true,
        },
        required: false,
        description:
          "Array of media URLs (images or videos) to attach to the post",
        default: [],
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

    const response = await makeRequest.call(this, "POST", "/posts", body);

    return [
      [
        {
          json: response,
        },
      ],
    ];
  }
}
