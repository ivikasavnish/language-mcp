/**
 * User management module
 */

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Repository<T> {
  add(item: T): void;
  findById(id: number): T | null;
  getAll(): T[];
}

export class UserRepository implements Repository<User> {
  private users: User[] = [];

  add(user: User): void {
    this.users.push(user);
  }

  findById(id: number): User | null {
    const user = this.users.find(u => u.id === id);
    return user || null;
  }

  getAll(): User[] {
    return [...this.users];
  }

  getUserByEmail(email: string): User | null {
    const user = this.users.find(u => u.email === email);
    return user || null;
  }
}

export function createUser(name: string, email: string): User {
  return {
    id: Date.now(),
    name,
    email
  };
}

export function validateEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}

export class UserService {
  constructor(private repository: UserRepository) {}

  addUser(name: string, email: string): User {
    const user = createUser(name, email);
    this.repository.add(user);
    return user;
  }

  getUser(id: number): User | null {
    return this.repository.findById(id);
  }
}

export const MAX_USERS = 1000;
