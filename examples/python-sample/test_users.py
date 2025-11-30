"""Tests for user management"""

import pytest
from users import User, UserRepository, create_user, validate_email


class TestUser:
    """Test cases for User class"""

    def test_user_creation(self):
        """Test creating a user"""
        user = User(1, "Alice", "alice@example.com")
        assert user.id == 1
        assert user.name == "Alice"
        assert user.email == "alice@example.com"

    def test_user_to_dict(self):
        """Test user to dictionary conversion"""
        user = User(1, "Alice", "alice@example.com")
        user_dict = user.to_dict()
        assert user_dict['id'] == 1
        assert user_dict['name'] == "Alice"


class TestUserRepository:
    """Test cases for UserRepository class"""

    def test_add_user(self):
        """Test adding a user"""
        repo = UserRepository()
        user = User(1, "Alice", "alice@example.com")
        repo.add_user(user)
        assert len(repo.users) == 1

    def test_get_user_by_id(self):
        """Test finding user by ID"""
        repo = UserRepository()
        user = User(1, "Alice", "alice@example.com")
        repo.add_user(user)

        found = repo.get_user_by_id(1)
        assert found is not None
        assert found.name == "Alice"

    def test_get_user_by_id_not_found(self):
        """Test user not found"""
        repo = UserRepository()
        found = repo.get_user_by_id(999)
        assert found is None


def test_create_user():
    """Test user factory function"""
    user = create_user("Bob", "bob@example.com")
    assert user.name == "Bob"
    assert user.email == "bob@example.com"


def test_validate_email():
    """Test email validation"""
    assert validate_email("test@example.com") == True
    assert validate_email("invalid") == False
    assert validate_email("no-at-sign.com") == False
