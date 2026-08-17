import { UserRole } from './user-role.model';

export interface Profile {
  id: string;
  fullName: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
