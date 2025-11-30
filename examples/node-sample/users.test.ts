/**
 * Tests for user management
 */

import { UserRepository, createUser, validateEmail, UserService } from './users';

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeEach(() => {
    repository = new UserRepository();
  });

  it('should add a user', () => {
    const user = createUser('Alice', 'alice@example.com');
    repository.add(user);
    expect(repository.getAll()).toHaveLength(1);
  });

  it('should find user by id', () => {
    const user = createUser('Alice', 'alice@example.com');
    repository.add(user);

    const found = repository.findById(user.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Alice');
  });

  it('should return null for non-existent user', () => {
    const found = repository.findById(999);
    expect(found).toBeNull();
  });

  it('should find user by email', () => {
    const user = createUser('Alice', 'alice@example.com');
    repository.add(user);

    const found = repository.getUserByEmail('alice@example.com');
    expect(found?.name).toBe('Alice');
  });
});

describe('createUser', () => {
  it('should create a user with name and email', () => {
    const user = createUser('Bob', 'bob@example.com');
    expect(user.name).toBe('Bob');
    expect(user.email).toBe('bob@example.com');
    expect(user.id).toBeGreaterThan(0);
  });
});

describe('validateEmail', () => {
  it('should validate correct email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('should reject invalid email', () => {
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('no-at-sign.com')).toBe(false);
  });
});

describe('UserService', () => {
  it('should add user through service', () => {
    const repository = new UserRepository();
    const service = new UserService(repository);

    const user = service.addUser('Charlie', 'charlie@example.com');
    expect(user.name).toBe('Charlie');

    const found = service.getUser(user.id);
    expect(found).not.toBeNull();
  });
});
