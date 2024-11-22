import { AwsCredentialIdentity, AwsCredentialIdentityProvider, ChecksumConstructor } from "@smithy/types";
export interface DsqlSignerConfig {
    /**
     * The AWS credentials to sign requests with. Uses the default credential provider chain if not specified.
     */
    credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider;
    /**
     * The hostname of the database to connect to.
     */
    hostname: string;
    /**
     * The region the database is located in. Uses the region inferred from the runtime if omitted.
     */
    region?: string;
    /**
     * The SHA256 hasher constructor to sign the request.
     */
    sha256?: ChecksumConstructor;
    /**
     * The amount of time in seconds the generated token is valid.
     */
    expiresIn?: number;
}
/**
 * The signer class that generates an auth token to a database.
 * @public
 */
export declare class DsqlSigner {
    private readonly credentials;
    private readonly hostname;
    private readonly protocol;
    private readonly region;
    private readonly service;
    private readonly sha256;
    private readonly expiresIn;
    constructor(configuration: DsqlSignerConfig);
    private _getAuthToken;
    getDbConnectAuthToken(): Promise<string>;
    getDbConnectAdminAuthToken(): Promise<string>;
}
