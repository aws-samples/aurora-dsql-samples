"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  DsqlSigner: () => DsqlSigner
});
module.exports = __toCommonJS(src_exports);

// src/Signer.ts
var import_util_format_url = require("@aws-sdk/util-format-url");
var import_protocol_http = require("@smithy/protocol-http");
var import_signature_v4 = require("@smithy/signature-v4");
var import_runtimeConfig = require("././runtimeConfig");
var _DsqlSigner = class _DsqlSigner {
  constructor(configuration) {
    this.protocol = "https:";
    this.service = "dsql";
    const runtimeConfiguration = (0, import_runtimeConfig.getRuntimeConfig)(configuration);
    this.credentials = runtimeConfiguration.credentials;
    this.hostname = runtimeConfiguration.hostname;
    this.region = runtimeConfiguration.region;
    this.sha256 = runtimeConfiguration.sha256;
    this.expiresIn = runtimeConfiguration.expiresIn ?? 900;
  }
  async _getAuthToken(action) {
    const signer = new import_signature_v4.SignatureV4({
      service: this.service,
      region: this.region,
      credentials: this.credentials,
      sha256: this.sha256
    });
    const request = new import_protocol_http.HttpRequest({
      method: "GET",
      protocol: this.protocol,
      hostname: this.hostname,
      query: {
        Action: action
      },
      headers: {
        host: `${this.hostname}`
      }
    });
    const presigned = await signer.presign(request, {
      expiresIn: this.expiresIn
    });
    return (0, import_util_format_url.formatUrl)(presigned).replace(`${this.protocol}//`, "");
  }
  async getDbConnectAuthToken() {
    return this._getAuthToken("DbConnect");
  }
  async getDbConnectAdminAuthToken() {
    return this._getAuthToken("DbConnectAdmin");
  }
};
__name(_DsqlSigner, "DsqlSigner");
var DsqlSigner = _DsqlSigner;
// Annotate the CommonJS export names for ESM import in node:

0 && (module.exports = {
  DsqlSigner
});

