import { ICredentialType, INodeProperties } from "n8n-workflow";

export class PostProxyApi implements ICredentialType {
  name = "postProxyApi";
  displayName = "PostProxy API";
  documentationUrl = "https://www.postproxy.dev/getting-started/overview/";
  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      default: "",
      required: true,
      typeOptions: {
        password: true,
      },
    },
  ];
}
