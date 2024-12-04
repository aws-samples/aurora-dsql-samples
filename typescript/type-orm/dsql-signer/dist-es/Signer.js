import { formatUrl } from "@aws-sdk/util-format-url";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { getRuntimeConfig } from "./runtimeConfig";
export class DsqlSigner {
    constructor(configuration) {
        this.protocol = "https:";
        this.service = "dsql";
        const runtimeConfiguration = getRuntimeConfig(configuration);
        this.credentials = runtimeConfiguration.credentials;
        this.hostname = runtimeConfiguration.hostname;
        this.region = runtimeConfiguration.region;
        this.sha256 = runtimeConfiguration.sha256;
        this.expiresIn = runtimeConfiguration.expiresIn ?? 900;
    }
    async _getAuthToken(action) {
        const signer = new SignatureV4({
            service: this.service,
            region: this.region,
            credentials: this.credentials,
            sha256: this.sha256,
        });
        const request = new HttpRequest({
            method: "GET",
            protocol: this.protocol,
            hostname: this.hostname,
            query: {
                Action: action,
            },
            headers: {
                host: `${this.hostname}`,
            },
        });
        const presigned = await signer.presign(request, {
            expiresIn: this.expiresIn,
        });
        return formatUrl(presigned).replace(`${this.protocol}//`, "");
    }
    async getDbConnectAuthToken() {
        return this._getAuthToken("DbConnect");
    }
    async getDbConnectAdminAuthToken() {
        return this._getAuthToken("DbConnectAdmin");
    }
}
