import { User } from '../domain/user';

export interface UserWriteRepoPort {
  deleteUserRoleByRoleId(roleId: string): Promise<void>;

  deleteUserRoleByDomain(domain: string): Promise<void>;

  deleteUserRoleByUserId(userId: string): Promise<void>;

  deleteById(id: string): Promise<void>;

  save(role: User, roleIds?: string[]): Promise<void>;

  update(role: User, roleIds?: string[]): Promise<void>;
}
