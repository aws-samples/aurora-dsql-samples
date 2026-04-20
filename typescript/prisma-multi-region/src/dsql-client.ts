// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";

const ADMIN = "admin";
const ADMIN_SCHEMA = "public";
const NON_ADMIN_SCHEMA = "myschema";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

interface RegionEndpoint {
  endpoint: string;
  pool: AuroraDSQLPool;
  prisma: PrismaClient;
}

/**
 * Multi-region Aurora DSQL Prisma client with automatic IAM authentication.
 *
 * Uses the Aurora DSQL Connector for connection pooling and token management.
 * Supports failover from primary to secondary region.
 */
export class MultiRegionDsqlClient {
  private primary: RegionEndpoint | null = null;
  private secondary: RegionEndpoint | null = null;
  private activePrisma: PrismaClient | null = null;
  private readonly user: string;
  private readonly schema: string;
  private readonly primaryEndpoint: string;
  private readonly secondaryEndpoint: string | undefined;
  private readonly region: string;

  constructor() {
    this.primaryEndpoint = getRequiredEnv("CLUSTER_ENDPOINT");
    this.secondaryEndpoint = process.env.CLUSTER_ENDPOINT_SECONDARY || undefined;
    this.user = process.env.CLUSTER_USER ?? ADMIN;
    this.region = process.env.AWS_REGION ?? "us-east-1";
    this.schema = this.user === ADMIN ? ADMIN_SCHEMA : NON_ADMIN_SCHEMA;
  }

  private createRegionEndpoint(endpoint: string): RegionEndpoint {
    const pool = new AuroraDSQLPool({
      host: endpoint,
      user: this.user,
      application_name: "prisma-dsql-multi-region",
      options: `-c search_path=${this.schema}`,
    });

    // Cast required: @prisma/adapter-pg bundles its own @types/pg which conflicts
    // with the top-level @types/pg. The types are compatible at runtime.
    const adapter = new PrismaPg(pool as any, { schema: this.schema });
    const prisma = new PrismaClient({
      adapter,
      log: ["warn", "error"],
    });

    return { endpoint, pool, prisma };
  }

  async connect(): Promise<void> {
    this.primary = this.createRegionEndpoint(this.primaryEndpoint);
    this.activePrisma = this.primary.prisma;

    // Verify primary connectivity
    await this.primary.prisma.$queryRaw`SELECT 1`;

    if (this.secondaryEndpoint) {
      try {
        this.secondary = this.createRegionEndpoint(this.secondaryEndpoint);
        await this.secondary.prisma.$queryRaw`SELECT 1`;
      } catch (err) {
        console.warn("Secondary region connection failed, running single-region:", err);
        this.secondary = null;
      }
    }
  }

  /**
   * Get the active Prisma client. Uses cached client; falls back to secondary on failure.
   */
  async getClient(): Promise<PrismaClient> {
    if (!this.activePrisma || !this.primary) {
      throw new Error("Not connected. Call connect() first.");
    }
    return this.activePrisma;
  }

  /**
   * Switch to secondary if primary fails. Call this from error handlers.
   */
  async failover(): Promise<PrismaClient> {
    if (this.secondary) {
      console.warn("Failing over to secondary region");
      this.activePrisma = this.secondary.prisma;
      return this.activePrisma;
    }
    throw new Error("No secondary region configured for failover");
  }

  getRegionInfo() {
    return {
      localRegion: this.region,
      primaryEndpoint: this.primaryEndpoint,
      secondaryEndpoint: this.secondaryEndpoint ?? "not configured",
      primaryConnected: this.primary !== null,
      secondaryConnected: this.secondary !== null,
    };
  }

  async dispose(): Promise<void> {
    if (this.primary) {
      await this.primary.prisma.$disconnect();
      await this.primary.pool.end();
    }
    if (this.secondary) {
      await this.secondary.prisma.$disconnect();
      await this.secondary.pool.end();
    }
  }
}
