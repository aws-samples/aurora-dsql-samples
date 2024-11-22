"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRuntimeConfig = void 0;
const sha256_js_1 = require("@aws-crypto/sha256-js");
const invalid_dependency_1 = require("@smithy/invalid-dependency");
const getRuntimeConfig = (config) => {
    return {
        runtime: "react-native",
        sha256: config?.sha256 ?? sha256_js_1.Sha256,
        credentials: (0, invalid_dependency_1.invalidProvider)("Credential is missing"),
        region: (0, invalid_dependency_1.invalidProvider)("Region is missing"),
        ...config,
    };
};
exports.getRuntimeConfig = getRuntimeConfig;
