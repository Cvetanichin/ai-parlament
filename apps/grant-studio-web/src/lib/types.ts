// Domain types for the fields the shell/auth layer reads directly.
// Table-specific types (Opportunity, Proposal, ...) are added per phase,
// alongside the queries that use them, not speculatively here.

export type OrganisationRole = "owner" | "admin" | "member" | "viewer";

export interface OrganisationMembership {
  organisationId: string;
  role: OrganisationRole;
}

export interface Profile {
  userId: string;
  isPlatformOperator: boolean;
}
