import {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IHttpRequestMethods,
} from "n8n-workflow";

const BASE_URL = "https://api.postproxy.dev/v1";

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
        displayName: "Account IDs",
        name: "accounts",
        type: "multiOptions",
        typeOptions: {
          loadOptionsMethod: "getAccounts",
        },
        required: true,
        default: [],
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        description: "Select the social media accounts to publish to",
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
        displayName: "Publish At",
        name: "publish_at",
        type: "dateTime",
        required: false,
        default: "",
        displayOptions: {
          show: {
            resource: ["post"],
            operation: ["create"],
          },
        },
        description:
          "Schedule the post for a specific date and time (ISO 8601 format). Leave empty for immediate publishing",
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
            url: `${BASE_URL}/accounts`,
            headers: {
              Authorization: `Bearer ${credentials.apiKey}`,
              "Content-Type": "application/json",
            },
            json: true,
            timeout: 30000,
          });

          const accounts = response.items || response || [];

          return accounts.map((account: any) => ({
            name: `${account.name || account.username || account.id} (${account.type || "unknown"})`,
            value: account.id,
          }));
        } catch (error: any) {
          throw new Error(`Failed to load accounts: ${error.message}`);
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const resource = this.getNodeParameter("resource", 0) as string;
    const operation = this.getNodeParameter("operation", 0) as string;

    if (resource === "account" && operation === "list") {
      const response = await makeRequest.call(this, "GET", "/accounts");
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
      const accountIds = this.getNodeParameter("accounts", 0) as string[];
      const mediaUrls = this.getNodeParameter("media", 0, []) as
        | string[]
        | undefined;
      const publishAt = this.getNodeParameter("publish_at", 0) as
        | string
        | undefined;

      if (!accountIds || accountIds.length === 0) {
        throw new Error("At least one account must be selected");
      }

      if (!content || content.trim().length === 0) {
        throw new Error("Content cannot be empty");
      }

      const body: any = {
        content: content.trim(),
        accounts: accountIds,
      };

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

      if (publishAt && publishAt.trim().length > 0) {
        body.publish_at = publishAt.trim();
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
