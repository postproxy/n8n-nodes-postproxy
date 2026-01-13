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

async function uploadFile(
  this: IExecuteFunctions,
  itemIndex: number,
  binaryPropertyName: string,
): Promise<any> {
  const credentials = await this.getCredentials("postProxyApi");
  const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);

  // TODO: Replace with real API call when endpoint is ready
  // Mock implementation for now
  const dataBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
  const fileName = binaryData.fileName || "file";
  const fileSize = dataBuffer.length;
  
  // Generate a mock URL (similar to what the real API would return)
  const mockFileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const mockUrl = `https://storage.postproxy.dev/files/${mockFileId}/${encodeURIComponent(fileName)}`;

  this.logger?.info(`[MOCK] Uploading file: ${fileName} (${fileSize} bytes)`);
  this.logger?.info(`[MOCK] File URL: ${mockUrl}`);

  // Return mock response structure
  return {
    id: mockFileId,
    url: mockUrl,
    filename: fileName,
    size: fileSize,
    content_type: binaryData.mimeType || "application/octet-stream",
    uploaded_at: new Date().toISOString(),
  };
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
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Account",
            value: "account",
          },
          {
            name: "Post",
            value: "post",
          },
          {
            name: "File",
            value: "file",
          },
        ],
        default: "account",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["account"],
          },
        },
        options: [
          {
            name: "List",
            value: "list",
            description: "Get a list of connected social media accounts",
          },
        ],
        default: "list",
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
            description:
              "Create a new post to publish on social media accounts",
          },
        ],
        default: "create",
      },
      {
        displayName: "Type",
        name: "type",
        type: "options",
        noDataExpression: true,
        options: [
          {
            name: "Now",
            value: "now",
            description: "Publish immediately",
          },
          {
            name: "Scheduled",
            value: "scheduled",
            description: "Schedule for later",
          },
        ],
        default: "now",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        description: "When to publish the post",
      },
      {
        displayName: "Profile Group",
        name: "profileGroup",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getProfileGroups",
        },
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        description: "Select the profile group to publish to",
      },
      {
        displayName: "Profile",
        name: "profiles",
        type: "multiOptions",
        typeOptions: {
          loadOptionsMethod: "getProfilesForGroup",
        },
        required: true,
        default: [],
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
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
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
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
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        description:
          "Array of media URLs (images or videos) to attach to the post",
        default: [],
      },
      {
        displayName: "Date",
        name: "date",
        type: "dateTime",
        required: true,
        default: "",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
            type: ["scheduled"],
          },
        },
        description:
          "Schedule the post for a specific date and time (ISO 8601 format)",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ["file"],
          },
        },
        options: [
          {
            name: "Upload",
            value: "upload",
            description: "Upload a file to PostProxy storage",
          },
        ],
        default: "upload",
      },
      {
        displayName: "Binary Property",
        name: "binaryPropertyName",
        type: "string",
        required: true,
        default: "data",
        displayOptions: {
          show: {
            resource: ["file"],
            operation: ["upload"],
          },
        },
        description:
          "Name of the binary property that contains the file to upload",
      },
    ],
  };

  methods = {
    loadOptions: {
      async getAccounts(
        this: ILoadOptionsFunctions,
      ): Promise<Array<{ name: string; value: string }>> {
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

          const profiles = response.items || response || [];

          return profiles.map((profile: any) => ({
            name: `${profile.name || profile.username || profile.id} (${profile.type || "unknown"})`,
            value: profile.id,
          }));
        } catch (error: any) {
          throw new Error(`Failed to load profiles: ${error.message}`);
        }
      },
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
        const credentials = await this.getCredentials("postProxyApi");
        const profileGroupId = this.getCurrentNodeParameter("profileGroup") as string | undefined;

        if (!profileGroupId) {
          return [];
        }

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

          const allProfiles = response.items || response || [];
          const groupIdNum = parseInt(profileGroupId);

          // Filter profiles by profile_group_id
          const groupProfiles = allProfiles.filter((profile: any) => {
            return profile.profile_group_id === groupIdNum || profile.profile_group_id === profileGroupId;
          });

          // Extract unique platform types
          const platformTypes = new Set<string>();
          groupProfiles.forEach((profile: any) => {
            if (profile.type) {
              platformTypes.add(profile.type);
            }
          });

          // Map platform types to human-readable names
          const platformNameMap: Record<string, string> = {
            twitter: "Twitter",
            instagram: "Instagram",
            facebook: "Facebook",
            linkedin: "LinkedIn",
            tiktok: "TikTok",
            youtube: "YouTube",
            pinterest: "Pinterest",
          };

          return Array.from(platformTypes).map((type) => ({
            name: platformNameMap[type.toLowerCase()] || type.charAt(0).toUpperCase() + type.slice(1),
            value: type,
          }));
        } catch (error: any) {
          throw new Error(`Failed to load profiles for group: ${error.message}`);
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const resource = this.getNodeParameter("resource", 0) as string;
    const operation = this.getNodeParameter("operation", 0) as string;

    if (resource === "account" && operation === "list") {
      const response = await makeRequest.call(this, "GET", "/profiles");
      const items = response.items || response || [];

      return [
        items.map((item: any) => ({
          json: {
            id: item.id,
            name: item.name,
            type: item.type,
            username: item.username,
            ...item,
          },
        })),
      ];
    }

    if (resource === "post" && operation === "create") {
      const content = this.getNodeParameter("content", 0) as string;
      const type = this.getNodeParameter("type", 0) as string;
      const profileGroupId = this.getNodeParameter("profileGroup", 0) as string;
      const profiles = this.getNodeParameter("profiles", 0) as string[];
      const mediaUrls = this.getNodeParameter("media", 0, []) as
        | string[]
        | undefined;
      const date = this.getNodeParameter("date", 0, "") as string | undefined;

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

      if (type === "scheduled" && (!date || date.trim().length === 0)) {
        throw new Error("Date is required when Type is 'Scheduled'");
      }

      // Build request body according to API specification
      const body: any = {
        post: {
          body: content.trim(),
        },
        profile_group_id: parseInt(profileGroupId),
        profiles: profiles,
      };

      if (type === "scheduled" && date) {
        body.post.scheduled_at = date.trim();
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

    if (resource === "file" && operation === "upload") {
      const binaryPropertyName = this.getNodeParameter(
        "binaryPropertyName",
        0,
      ) as string;

      const items = this.getInputData();
      const returnData: INodeExecutionData[] = [];

      for (let i = 0; i < items.length; i++) {
        try {
          const response = await uploadFile.call(
            this,
            i,
            binaryPropertyName,
          );

          returnData.push({
            json: {
              url: response.url || response.data?.url || response.file?.url,
              id: response.id || response.data?.id || response.file?.id,
              ...response,
            },
            binary: items[i].binary,
          });
        } catch (error: any) {
          if (this.continueOnFail()) {
            returnData.push({
              json: {
                error: error.message,
              },
              binary: items[i].binary,
            });
            continue;
          }
          throw error;
        }
      }

      return [returnData];
    }

    throw new Error(
      `Unknown resource/operation combination: ${resource}/${operation}`,
    );
  }
}
