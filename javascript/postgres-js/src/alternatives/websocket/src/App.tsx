/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuth } from "react-oidc-context";
import React, { useState } from "react";
import {
  AuroraDSQLWsConfig,
  auroraDSQLWsPostgres,
} from "@aws/aurora-dsql-postgresjs-connector";
import postgres from "postgres";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import { awsConfig, dsqlConfig } from "./config";

let sql: postgres.Sql<{}> | null;

const App: React.FC = () => {
  const auth = useAuth();
  const [query, setQuery] = useState(`SELECT NOW();`);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    const getAWSCredentials = (idToken: string): (() => Promise<AwsCredentialIdentity>) => {
      return fromCognitoIdentityPool({
        clientConfig: { region: awsConfig.region },
        identityPoolId: awsConfig.identityPoolId,
        logins: {
          [`cognito-idp.${awsConfig.region}.amazonaws.com/${awsConfig.userPoolId}`]: idToken,
        },
      });
    };

    const registerConnection = async () => {
      if (!auth.user?.id_token) {
        setResult("Error: Authentication token not available");
        return;
      }

      try {
        const wsConfig: AuroraDSQLWsConfig<{}> = {
          host: dsqlConfig.host,
          database: dsqlConfig.database,
          user: dsqlConfig.user,
          customCredentialsProvider: getAWSCredentials(auth.user.id_token),
          tokenDurationSecs: dsqlConfig.tokenDurationSecs,
        };
        sql = auroraDSQLWsPostgres(wsConfig);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setResult(`Error: ${errorMessage} `);
      }
    };

    registerConnection();
  }, [auth.isAuthenticated, auth.user]);

  const executeQuery = async () => {
    setLoading(true);

    try {
      if (sql) {
        const result = await sql.unsafe(query);
        setResult(`We got: ${JSON.stringify(result, null, 2)} `);
      } else {
        throw new Error("Database connection not initialized");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setResult(`Error: ${errorMessage} `);
    } finally {
      setLoading(false);
    }
  };

  const signOutRedirect = async () => {
    await auth.removeUser();
    window.location.href = `${awsConfig.cognitoDomain}/logout?client_id=${awsConfig.clientId}&logout_uri=${encodeURIComponent(awsConfig.redirectUri)}`;
  };

  if (auth.isLoading) {
    return <div>Loading...</div>;
  }

  if (auth.error) {
    return <div>Encountering error... {auth.error.message}</div>;
  }

  if (auth.isAuthenticated) {
    return (
      <div style={{ position: "relative", padding: "20px", fontFamily: "monospace" }}>
        <button
          onClick={() => signOutRedirect()}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            padding: "8px 16px",
            fontSize: "14px",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Logout
        </button>
        <h1>
          Aurora DSQL Query Editor React Sample
        </h1>
        <div style={{
          backgroundColor: "#fff3cd",
          border: "1px solid #ffc107",
          borderRadius: "4px",
          padding: "12px",
          marginBottom: "10px",
          color: "#856404"
        }}>
          <strong>⚠️ Security Warning:</strong> This demo executes SQL queries without sanitization or validation. Do not use with production data or sensitive information. Exercise caution with INSERT, UPDATE, DELETE, and DROP statements.
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your SQL query here..."
          style={{ width: "100%", height: "150px", marginBottom: "10px" }}
        />
        <button onClick={executeQuery} disabled={loading}>
          {loading ? "Executing..." : "Execute Query"}
        </button>
        <div style={{ marginTop: "20px" }}>
          <h3>Result:</h3>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "10px",
              minHeight: "100px",
            }}
          >
            {result || "No results yet"}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      gap: "20px"
    }}>
      <h1>Aurora DSQL Query Editor React Sample</h1>
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={() => auth.signinRedirect()}
          style={{
            padding: "12px 24px",
            fontSize: "16px",
            backgroundColor: "#0066cc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Sign in
        </button>
      </div>
    </div>
  );
};

export default App;
