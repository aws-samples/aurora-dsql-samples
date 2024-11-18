import { Sha256 } from "@aws-crypto/sha256-js";
import { DsqlSignerConfig } from "./Signer";
/**
 * @internal
 */
export declare const getRuntimeConfig: (config: DsqlSignerConfig) => {
    credentials: import("@smithy/types").AwsCredentialIdentity | import("@smithy/types").AwsCredentialIdentityProvider | import("@smithy/types").Provider<any>;
    hostname: string;
    region: string | import("@smithy/types").Provider<any>;
    sha256: import("@smithy/types").ChecksumConstructor | typeof Sha256;
    expiresIn?: number | undefined;
    runtime: string;
};
