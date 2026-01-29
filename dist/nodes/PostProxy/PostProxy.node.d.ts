import { IExecuteFunctions, ILoadOptionsFunctions, INodeExecutionData, INodeType, INodeTypeDescription, INodeListSearchResult } from "n8n-workflow";
export declare class PostProxy implements INodeType {
    description: INodeTypeDescription;
    methods: {
        listSearch: {
            searchPosts(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult>;
            searchProfiles(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult>;
            searchProfileGroups(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult>;
        };
        loadOptions: {
            getProfileGroups(this: ILoadOptionsFunctions): Promise<Array<{
                name: string;
                value: string;
            }>>;
            getProfilesForGroup(this: ILoadOptionsFunctions): Promise<Array<{
                name: string;
                value: string;
            }>>;
        };
    };
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
