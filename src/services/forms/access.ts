import { UserRoles } from "../../../generated/prisma/client";

export const FORM_WRITE_ROLES: UserRoles[] = [
  UserRoles.ADMIN,
  UserRoles.SALES,
  UserRoles.ACCOUNTMANAGER,
  UserRoles.OPERATIONS,
];

export function normalizeRole(role: string | undefined | null) {
  return (role || "").trim().toUpperCase();
}

export function isAdmin(role: string | undefined | null) {
  return normalizeRole(role) === UserRoles.ADMIN;
}

/** Roles whose existing access is read-every authenticated resource. */
export function canReadAllForms(role: string | undefined | null) {
  const normalized = normalizeRole(role);
  return (
    normalized === UserRoles.ADMIN ||
    normalized === UserRoles.VIEWER ||
    normalized === UserRoles.FINANCE
  );
}

export function canWriteForms(role: string | undefined | null) {
  return FORM_WRITE_ROLES.includes(normalizeRole(role) as UserRoles);
}

export function canPermanentlyDelete(role: string | undefined | null) {
  return isAdmin(role);
}

export function canReassignOwner(role: string | undefined | null) {
  return isAdmin(role);
}

export function canManageAnyTemplate(role: string | undefined | null) {
  return isAdmin(role);
}
