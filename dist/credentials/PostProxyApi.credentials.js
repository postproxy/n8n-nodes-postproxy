"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostProxyApi = void 0;
class PostProxyApi {
    constructor() {
        this.name = "postProxyApi";
        this.displayName = "PostProxy API";
        this.documentationUrl = "https://www.postproxy.dev/getting-started/overview/";
        this.properties = [
            {
                displayName: "API Key",
                name: "apiKey",
                type: "string",
                typeOptions: { password: true },
                default: "",
                required: true,
            },
        ];
        this.authenticate = {
            type: "generic",
            properties: {
                headers: {
                    Authorization: "=Bearer {{$credentials.apiKey}}",
                },
            },
        };
        this.test = {
            request: {
                baseURL: "https://api.postproxy.dev/api",
                url: "/profile_groups/",
            },
        };
    }
}
exports.PostProxyApi = PostProxyApi;
