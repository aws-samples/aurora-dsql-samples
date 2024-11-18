import { Sha256 } from "@aws-crypto/sha256-browser";
import { invalidProvider } from "@smithy/invalid-dependency";
export const getRuntimeConfig = (config) => {
    return {
        runtime: "browser",
        sha256: config?.sha256 ?? Sha256,
        credentials: invalidProvider("Credential is missing"),
        region: invalidProvider("Region is missing"),
        ...config,
    };
};
