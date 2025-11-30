package main

import "fmt"

// User represents a user in the system
type User struct {
	ID   int
	Name string
	Email string
}

// Handler interface for request handlers
type Handler interface {
	Handle(request string) error
	Validate() bool
}

// UserHandler implements the Handler interface
type UserHandler struct {
	users []User
}

// Handle processes user requests
func (h *UserHandler) Handle(request string) error {
	fmt.Println("Handling request:", request)
	return nil
}

// Validate checks if the handler is valid
func (h *UserHandler) Validate() bool {
	return len(h.users) > 0
}

// GetUserByID finds a user by their ID
func GetUserByID(id int, users []User) *User {
	for _, user := range users {
		if user.ID == id {
			return &user
		}
	}
	return nil
}

// CreateUser creates a new user
func CreateUser(name, email string) User {
	return User{
		Name:  name,
		Email: email,
	}
}

func main() {
	users := []User{
		CreateUser("Alice", "alice@example.com"),
		CreateUser("Bob", "bob@example.com"),
	}

	user := GetUserByID(1, users)
	if user != nil {
		fmt.Printf("Found user: %s\n", user.Name)
	}

	handler := &UserHandler{users: users}
	handler.Handle("GET /users")
}
