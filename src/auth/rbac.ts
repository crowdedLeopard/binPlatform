// TODO: Role-based access control
// - Define roles (read, write, admin)
// - Define permissions
// - Check if user/key has permission for action
// - Audit access attempts

export enum Role {
  Read = 'read',
  Write = 'write',
  Admin = 'admin'
}

export enum Permission {
  ReadCouncils = 'councils:read',
  ReadProperties = 'properties:read',
  SearchProperties = 'properties:search',
  TriggerAdapter = 'adapters:trigger',
  ManageKillSwitch = 'adapters:manage-kill-switch',
  ViewAuditLog = 'audit:read',
  InvalidateCache = 'cache:invalidate'
}

const rolePermissions: Record<Role, Permission[]> = {
  [Role.Read]: [
    Permission.ReadCouncils,
    Permission.ReadProperties,
    Permission.SearchProperties
  ],
  [Role.Write]: [
    Permission.ReadCouncils,
    Permission.ReadProperties,
    Permission.SearchProperties,
    Permission.TriggerAdapter
  ],
  [Role.Admin]: [
    Permission.ReadCouncils,
    Permission.ReadProperties,
    Permission.SearchProperties,
    Permission.TriggerAdapter,
    Permission.ManageKillSwitch,
    Permission.ViewAuditLog,
    Permission.InvalidateCache
  ]
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) || false;
}
