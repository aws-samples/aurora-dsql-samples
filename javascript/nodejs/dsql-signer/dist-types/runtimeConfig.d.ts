import { Hash } from "@smithy/hash-node";
import { DsqlSignerConfig } from "./Signer";
/**
 * @internal
 */
export declare const getRuntimeConfig: (config: DsqlSignerConfig) => {
    credentials: import("@smithy/types").AwsCredentialIdentity | import("@smithy/types").AwsCredentialIdentityProvider;
    hostname: string;
    region: string | import("@smithy/types").Provider<string>;
    sha256: import("@smithy/types").ChecksumConstructor | (new (secret?: import("@smithy/types").SourceData | undefined) => Hash);
    expiresIn?: number | undefined;
    runtime: string;
};
