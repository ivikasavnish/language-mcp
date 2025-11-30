"""User management module"""

class User:
    """Represents a user in the system"""

    def __init__(self, id, name, email):
        self.id = id
        self.name = name
        self.email = email

    def to_dict(self):
        """Convert user to dictionary"""
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email
        }


class UserRepository:
    """Repository for user data"""

    def __init__(self):
        self.users = []

    def add_user(self, user):
        """Add a user to the repository"""
        self.users.append(user)

    def get_user_by_id(self, user_id):
        """Find a user by ID"""
        for user in self.users:
            if user.id == user_id:
                return user
        return None

    def get_all_users(self):
        """Get all users"""
        return self.users


def create_user(name, email):
    """Factory function to create a user"""
    return User(id=None, name=name, email=email)


def validate_email(email):
    """Validate email format"""
    return '@' in email and '.' in email


# Module-level variable
MAX_USERS = 1000
