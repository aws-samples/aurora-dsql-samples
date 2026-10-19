import { closePool } from "../db/pool.js";
import { createTenant } from "../repositories/tenants.js";
import { createAccount } from "../repositories/accounts.js";
import { createContact } from "../repositories/contacts.js";
import { createOpportunity } from "../repositories/opportunities.js";

/**
 * Seed two demo tenants with isolated data. Prints each tenant id so you can
 * mint a bearer token and observe that neither tenant can see the other's
 * records:
 *
 *   APP_JWT_SECRET=<secret> npm run mint-token -- <tenant-id>
 *
 * The POST /api/tenants/:id/token route also mints one, but it is gated behind
 * ENABLE_TENANT_ADMIN_ROUTES and is off by default, because an open
 * token-minting endpoint lets any caller act as any tenant.
 */
async function seed(): Promise<void> {
  for (const tenantName of ["Acme Corp", "Globex LLC"]) {
    const tenant = await createTenant(tenantName);
    const account = await createAccount(tenant.id, {
      name: `${tenantName} - Flagship Account`,
      industry: "Technology",
      website: "https://example.com",
    });
    await createContact(tenant.id, {
      account_id: account.id,
      first_name: "Jordan",
      last_name: "Rivera",
      email: "jordan@example.com",
    });
    await createOpportunity(tenant.id, {
      account_id: account.id,
      name: "Annual subscription",
      stage: "qualification",
      amount: 50000,
    });
    console.log(`seeded tenant "${tenantName}": ${tenant.id}`);
  }
  console.log("seed complete");
}

seed()
  .then(closePool)
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
