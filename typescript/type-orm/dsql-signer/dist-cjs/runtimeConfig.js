"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRuntimeConfig = void 0;
const credential_providers_1 = require("@aws-sdk/credential-providers");
const config_resolver_1 = require("@smithy/config-resolver");
const hash_node_1 = require("@smithy/hash-node");
const node_config_provider_1 = require("@smithy/node-config-provider");
const getRuntimeConfig = (config) => {
    return {
        runtime: "node",
        sha256: config?.sha256 ?? hash_node_1.Hash.bind(null, "sha256"),
        credentials: config?.credentials ?? (0, credential_providers_1.fromNodeProviderChain)(),
        region: config?.region ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_REGION_CONFIG_OPTIONS, config_resolver_1.NODE_REGION_CONFIG_FILE_OPTIONS),
        ...config,
    };
};
exports.getRuntimeConfig = getRuntimeConfig;
