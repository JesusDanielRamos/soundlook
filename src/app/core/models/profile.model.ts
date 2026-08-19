import { UserRole } from './user-role.model';

export interface Profile {
  id: string;
  fullName: string | null;
  role: UserRole;
  semester: number | null;
  hasDisability: boolean;
  disabilityDescription: string | null;
  createdAt: string;
  updatedAt: string;
}
