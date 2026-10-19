// Domain types for the multi-tenant CRM.

export interface Tenant {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface Account {
  id: string;
  tenant_id: string;
  name: string;
  industry: string | null;
  website: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export type OpportunityStage =
  | "prospecting"
  | "qualification"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export interface Opportunity {
  id: string;
  tenant_id: string;
  account_id: string;
  name: string;
  stage: OpportunityStage;
  amount: string; // NUMERIC is returned as string by node-postgres
  close_date: string | null;
  owner_id: string | null;
  created_at: string;
}

export type ActivityRelatedType = "account" | "contact" | "opportunity";

export interface Activity {
  id: string;
  tenant_id: string;
  related_type: ActivityRelatedType;
  related_id: string;
  subject: string;
  notes: string | null;
  due_at: string | null;
  done: boolean;
  created_at: string;
}

/** Thrown by repositories/services to map to a specific HTTP status. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
