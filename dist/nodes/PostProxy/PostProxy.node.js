"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostProxy = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const BASE_URL = "https://api.postproxy.dev/api";
// Helper function to simplify post response
function simplifyPost(post) {
    // Handle multiple response formats for backward compatibility:
    // - New API format: {id, content, status, draft, scheduled_at, created_at, platforms: [{platform, status, params, attempted_at, insights}]}
    // - Old API format: {id, content, created_at, networks: [{platform, status, attempted_at}]}
    // - Create response: {id, post: {body, scheduled_at}, status, accounts: [...]}
    var _a, _b, _c;
    const content = post.content || ((_a = post.post) === null || _a === void 0 ? void 0 : _a.body) || post.body || "";
    // Prioritize new 'platforms' format, fallback to old formats for compatibility
    const platforms = post.platforms || post.networks || post.accounts || [];
    const result = {
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
    if (post.scheduled_at !== undefined || ((_b = post.post) === null || _b === void 0 ? void 0 : _b.scheduled_at) !== undefined) {
        result.scheduled_at = ((_c = post.post) === null || _c === void 0 ? void 0 : _c.scheduled_at) || post.scheduled_at;
    }
    if (post.updated_at !== undefined) {
        result.updated_at = post.updated_at;
    }
    if (post.profile_group_id !== undefined) {
        result.profile_group_id = post.profile_group_id;
    }
    // Map platforms/networks/accounts to unified format
    result.platforms = platforms.map((item) => {
        const mapped = {
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
function simplifyProfile(profile) {
    const result = {
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
function extractResourceLocatorValue(value) {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "object" && value !== null) {
        // Resource locator object format: { mode: 'list' | 'id', value: string }
        return value.value || "";
    }
    return "";
}
async function makeRequest(method, endpoint, body) {
    var _a, _b, _c, _d, _e, _f;
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
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.info(`PostProxy request_id: ${requestId}`);
        }
        return response;
    }
    catch (error) {
        const statusCode = error.statusCode || ((_b = error.response) === null || _b === void 0 ? void 0 : _b.status);
        const requestId = (_d = (_c = error.response) === null || _c === void 0 ? void 0 : _c.headers) === null || _d === void 0 ? void 0 : _d["x-request-id"];
        let errorMessage = "PostProxy API request failed";
        let description = "";
        if (requestId) {
            (_e = this.logger) === null || _e === void 0 ? void 0 : _e.error(`PostProxy request_id: ${requestId}`);
            description += `Request ID: ${requestId}\n`;
        }
        if (statusCode) {
            const errorBody = ((_f = error.response) === null || _f === void 0 ? void 0 : _f.body) || {};
            const apiMessage = errorBody.message || errorBody.error || error.message;
            if (statusCode >= 400 && statusCode < 500) {
                errorMessage = `PostProxy API error (${statusCode})`;
                description += apiMessage || "Client error";
                if (statusCode === 401) {
                    description += "\n\nPlease check your API credentials.";
                }
                else if (statusCode === 404) {
                    description += "\n\nThe requested resource was not found.";
                }
                else if (statusCode === 429) {
                    description += "\n\nRate limit exceeded. Please try again later.";
                }
            }
            else if (statusCode >= 500) {
                errorMessage = `PostProxy API server error (${statusCode})`;
                description += apiMessage || "Internal server error";
                description += "\n\nPlease try again later or contact PostProxy support.";
            }
        }
        else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
            errorMessage = "PostProxy API request timed out";
            description = "The request took too long to complete. Please try again.";
        }
        else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
            errorMessage = "PostProxy API connection failed";
            description = "Could not connect to PostProxy API. Please check your network connection.";
        }
        throw new n8n_workflow_1.NodeApiError(this.getNode(), error, {
            message: errorMessage,
            description: description || error.message,
            httpCode: String(statusCode || ""),
        });
    }
}
class PostProxy {
    constructor() {
        this.description = {
            displayName: "PostProxy",
            name: "postProxy",
            icon: "file:postproxy.svg",
            group: ["transform"],
            version: 1,
            description: "Publish and schedule posts across multiple social media platforms",
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
                        {
                            name: "Draft",
                            value: "draft",
                            description: "Create a draft post that won't be published automatically",
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
                    description: "Schedule the post for a specific date and time (ISO 8601 format)",
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
                    description: "Array of media URLs (images or videos) to attach to the post",
                    default: [],
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
                    description: "Platform-specific parameters as JSON object (e.g., {\"alt_text\": \"Image description\"}). These will be passed to each platform in the 'params' field.",
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
        this.methods = {
            listSearch: {
                async searchPosts(filter) {
                    var _a;
                    const credentials = await this.getCredentials("postProxyApi");
                    try {
                        // Check if current operation is "publish" to filter only draft posts
                        let operation;
                        try {
                            operation = this.getCurrentNodeParameter("operation");
                        }
                        catch {
                            try {
                                const node = this.getNode();
                                operation = (_a = node === null || node === void 0 ? void 0 : node.parameters) === null || _a === void 0 ? void 0 : _a.operation;
                            }
                            catch {
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
                        const response = await this.helpers.httpRequest({
                            method: "GET",
                            url: url,
                            headers: {
                                Authorization: `Bearer ${credentials.apiKey}`,
                                "Content-Type": "application/json",
                            },
                            json: true,
                            timeout: 30000,
                        });
                        let posts = response.data || response.items || (Array.isArray(response) ? response : []);
                        // Filter only draft posts if operation is "publish"
                        if (operation === "publish") {
                            posts = posts.filter((post) => {
                                // Check both status field and draft field for compatibility
                                return post.status === "draft" || post.draft === true;
                            });
                        }
                        let results = posts.map((post) => {
                            var _a;
                            // Handle new API format: content field, or legacy post.body format
                            const content = post.content || ((_a = post.post) === null || _a === void 0 ? void 0 : _a.body) || post.body || "";
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
                            results = results.filter((item) => item.name.toLowerCase().includes(filterLower) ||
                                String(item.value).toLowerCase().includes(filterLower));
                        }
                        return { results };
                    }
                    catch (error) {
                        throw new n8n_workflow_1.NodeApiError(this.getNode(), error, {
                            message: "Failed to search posts",
                            description: error.message,
                        });
                    }
                },
                async searchProfiles(filter) {
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
                        let results = profiles.map((profile) => {
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
                            results = results.filter((item) => item.name.toLowerCase().includes(filterLower) ||
                                String(item.value).toLowerCase().includes(filterLower));
                        }
                        return { results };
                    }
                    catch (error) {
                        throw new n8n_workflow_1.NodeApiError(this.getNode(), error, {
                            message: "Failed to search profiles",
                            description: error.message,
                        });
                    }
                },
                async searchProfileGroups(filter) {
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
                        let results = groups.map((group) => ({
                            name: group.name || `Group ${group.id}`,
                            value: group.id != null ? String(group.id) : "",
                        }));
                        // Filter by search term if provided
                        if (filter && typeof filter === "string") {
                            const filterLower = filter.toLowerCase();
                            results = results.filter((item) => item.name.toLowerCase().includes(filterLower) ||
                                String(item.value).toLowerCase().includes(filterLower));
                        }
                        return { results };
                    }
                    catch (error) {
                        throw new n8n_workflow_1.NodeApiError(this.getNode(), error, {
                            message: "Failed to search profile groups",
                            description: error.message,
                        });
                    }
                },
            },
            loadOptions: {
                async getProfileGroups() {
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
                        return groups.map((group) => ({
                            name: group.name || `Group ${group.id}`,
                            value: group.id.toString(),
                        }));
                    }
                    catch (error) {
                        throw new n8n_workflow_1.NodeApiError(this.getNode(), error, {
                            message: "Failed to load profile groups",
                            description: error.message,
                        });
                    }
                },
                async getProfilesForGroup() {
                    var _a;
                    try {
                        const credentials = await this.getCredentials("postProxyApi");
                        // Try to get profileGroupId from node parameters
                        let profileGroupId;
                        try {
                            profileGroupId = this.getCurrentNodeParameter("profileGroup");
                        }
                        catch {
                            // getCurrentNodeParameter may fail, try alternative methods
                            try {
                                profileGroupId = this.getNodeParameter("profileGroup", 0);
                            }
                            catch {
                                try {
                                    const node = this.getNode();
                                    profileGroupId = (_a = node === null || node === void 0 ? void 0 : node.parameters) === null || _a === void 0 ? void 0 : _a.profileGroup;
                                }
                                catch {
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
                            // Extract value from resource locator if needed
                            const groupIdValue = typeof profileGroupId === "object" && profileGroupId !== null
                                ? extractResourceLocatorValue(profileGroupId)
                                : String(profileGroupId);
                            if (groupIdValue) {
                                profiles = profiles.filter((profile) => {
                                    const profileGroupId = String(profile.profile_group_id || "");
                                    return profileGroupId === groupIdValue;
                                });
                            }
                        }
                        // Map profiles to dropdown options
                        return profiles.map((profile) => {
                            const profileName = profile.name || profile.username || `Profile ${profile.id}`;
                            const platformType = profile.platform || "unknown";
                            const displayName = `${profileName} (${platformType})`;
                            const profileId = profile.id != null ? String(profile.id) : "";
                            return {
                                name: displayName,
                                value: profileId,
                            };
                        });
                    }
                    catch (error) {
                        throw new n8n_workflow_1.NodeApiError(this.getNode(), error, {
                            message: "Failed to load profiles",
                            description: error.message,
                        });
                    }
                },
            },
        };
    }
    async execute() {
        const resource = this.getNodeParameter("resource", 0);
        const operation = this.getNodeParameter("operation", 0);
        let responseData;
        // POST RESOURCE
        if (resource === "post") {
            if (operation === "create") {
                const content = this.getNodeParameter("content", 0);
                const publishType = this.getNodeParameter("publishType", 0);
                const profileGroupRaw = this.getNodeParameter("profileGroup", 0);
                const profileGroupId = extractResourceLocatorValue(profileGroupRaw);
                const profiles = this.getNodeParameter("profiles", 0);
                const mediaUrls = this.getNodeParameter("media", 0, []);
                const publishAt = this.getNodeParameter("publish_at", 0, "");
                const platformParamsRaw = this.getNodeParameter("platformParams", 0, "{}");
                // Validation
                if (!content || content.trim().length === 0) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Content cannot be empty", { description: "Please provide post content in the 'Content' field." });
                }
                if (!profileGroupId) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Profile Group must be selected", { description: "Please select a profile group to publish to." });
                }
                if (!profiles || profiles.length === 0) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "At least one profile must be selected", { description: "Please select at least one social media profile to publish to." });
                }
                if (publishType === "schedule" && (!publishAt || publishAt.trim().length === 0)) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Publish At date is required", { description: "When Publish Type is 'Schedule', you must provide a Publish At date." });
                }
                // Build request body according to API specification
                const body = {
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
                if (mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0) {
                    const filteredUrls = mediaUrls
                        .filter((url) => url && typeof url === "string" && url.trim().length > 0)
                        .map((url) => url.trim());
                    if (filteredUrls.length > 0) {
                        body.media = filteredUrls;
                    }
                }
                // Parse and add platform parameters if provided
                if (platformParamsRaw && platformParamsRaw.trim() !== "" && platformParamsRaw !== "{}") {
                    try {
                        const platformParams = typeof platformParamsRaw === "string"
                            ? JSON.parse(platformParamsRaw)
                            : platformParamsRaw;
                        if (platformParams && typeof platformParams === "object" && Object.keys(platformParams).length > 0) {
                            body.params = platformParams;
                        }
                    }
                    catch (error) {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Invalid Platform Parameters JSON", { description: "Platform Parameters must be valid JSON. Error: " + error.message });
                    }
                }
                responseData = await makeRequest.call(this, "POST", "/posts", body);
            }
            else if (operation === "delete") {
                const postIdRaw = this.getNodeParameter("postId", 0);
                const postId = extractResourceLocatorValue(postIdRaw);
                if (!postId) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Post ID is required", { description: "Please provide a valid Post ID." });
                }
                responseData = await makeRequest.call(this, "DELETE", `/posts/${postId}`);
            }
            else if (operation === "get") {
                const postIdRaw = this.getNodeParameter("postId", 0);
                const postId = extractResourceLocatorValue(postIdRaw);
                if (!postId) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Post ID is required", { description: "Please provide a valid Post ID." });
                }
                responseData = await makeRequest.call(this, "GET", `/posts/${postId}`);
                const simplify = this.getNodeParameter("simplify", 0, true);
                if (simplify && responseData) {
                    responseData = simplifyPost(responseData);
                }
            }
            else if (operation === "getMany") {
                const returnAll = this.getNodeParameter("returnAll", 0, false);
                const simplify = this.getNodeParameter("simplify", 0, true);
                let allItems = [];
                let currentPage = 0;
                let total = 0;
                let perPage = 10;
                if (!returnAll) {
                    currentPage = this.getNodeParameter("page", 0, 0);
                    perPage = this.getNodeParameter("per_page", 0, 10);
                }
                do {
                    const queryParams = new URLSearchParams();
                    queryParams.append("page", String(currentPage));
                    queryParams.append("per_page", String(perPage));
                    const response = await makeRequest.call(this, "GET", `/posts?${queryParams.toString()}`);
                    const items = response.data || response.items || (Array.isArray(response) ? response : []);
                    allItems = allItems.concat(items);
                    if (returnAll) {
                        total = response.total || items.length;
                        perPage = response.per_page || perPage;
                        currentPage++;
                    }
                    else {
                        break;
                    }
                } while (returnAll && allItems.length < total);
                if (!returnAll) {
                    const limit = this.getNodeParameter("limit", 0, 50);
                    allItems = allItems.slice(0, limit);
                }
                if (simplify) {
                    allItems = allItems.map((post) => simplifyPost(post));
                }
                responseData = {
                    total: returnAll ? total : allItems.length,
                    page: returnAll ? 0 : currentPage,
                    per_page: perPage,
                    data: allItems,
                };
            }
            else if (operation === "update") {
                const postIdRaw = this.getNodeParameter("postId", 0);
                const postId = extractResourceLocatorValue(postIdRaw);
                const updateFields = this.getNodeParameter("updateFields", 0, {});
                if (!postId) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Post ID is required", { description: "Please provide a valid Post ID." });
                }
                // Build update body
                const body = {
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
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "At least one field must be provided to update", { description: "Please provide at least one field (Content or Scheduled At) to update the post." });
                }
                responseData = await makeRequest.call(this, "PATCH", `/posts/${postId}`, body);
            }
            else if (operation === "publish") {
                const postIdRaw = this.getNodeParameter("postId", 0);
                const postId = extractResourceLocatorValue(postIdRaw);
                if (!postId) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Post ID is required", { description: "Please provide a valid Post ID." });
                }
                responseData = await makeRequest.call(this, "POST", `/posts/${postId}/publish`);
                const simplify = this.getNodeParameter("simplify", 0, true);
                if (simplify && responseData) {
                    responseData = simplifyPost(responseData);
                }
            }
        }
        // PROFILE RESOURCE
        else if (resource === "profile") {
            if (operation === "get") {
                const profileIdRaw = this.getNodeParameter("profileId", 0);
                const profileId = extractResourceLocatorValue(profileIdRaw);
                if (!profileId) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), "Profile ID is required", { description: "Please provide a valid Profile ID." });
                }
                responseData = await makeRequest.call(this, "GET", `/profiles/${profileId}`);
                const simplify = this.getNodeParameter("simplify", 0, true);
                if (simplify && responseData) {
                    responseData = simplifyProfile(responseData);
                }
            }
            else if (operation === "getMany") {
                const returnAll = this.getNodeParameter("returnAll", 0, false);
                const simplify = this.getNodeParameter("simplify", 0, true);
                let allItems = [];
                let currentPage = 0;
                let total = 0;
                let perPage = 10;
                if (!returnAll) {
                    currentPage = this.getNodeParameter("page", 0, 0);
                    perPage = this.getNodeParameter("per_page", 0, 10);
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
                    }
                    else {
                        break;
                    }
                } while (returnAll && allItems.length < total);
                if (!returnAll) {
                    const limit = this.getNodeParameter("limit", 0, 50);
                    allItems = allItems.slice(0, limit);
                }
                if (simplify) {
                    allItems = allItems.map((profile) => simplifyProfile(profile));
                }
                responseData = {
                    total: returnAll ? total : allItems.length,
                    page: returnAll ? 0 : currentPage,
                    per_page: perPage,
                    data: allItems,
                };
            }
        }
        // PROFILE GROUP RESOURCE
        else if (resource === "profileGroup") {
            if (operation === "getMany") {
                const returnAll = this.getNodeParameter("returnAll", 0, false);
                let allItems = [];
                let currentPage = 0;
                let total = 0;
                let perPage = 10;
                if (!returnAll) {
                    currentPage = this.getNodeParameter("page", 0, 0);
                    perPage = this.getNodeParameter("per_page", 0, 10);
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
                    }
                    else {
                        break;
                    }
                } while (returnAll && allItems.length < total);
                if (!returnAll) {
                    const limit = this.getNodeParameter("limit", 0, 50);
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
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `The operation "${operation}" for resource "${resource}" is not supported`, { description: "This combination of resource and operation is not available." });
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
exports.PostProxy = PostProxy;
