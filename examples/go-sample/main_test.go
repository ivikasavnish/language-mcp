package main

import "testing"

func TestGetUserByID(t *testing.T) {
	users := []User{
		{ID: 1, Name: "Alice", Email: "alice@example.com"},
		{ID: 2, Name: "Bob", Email: "bob@example.com"},
	}

	user := GetUserByID(1, users)
	if user == nil {
		t.Error("Expected to find user with ID 1")
	}
	if user.Name != "Alice" {
		t.Errorf("Expected Alice, got %s", user.Name)
	}
}

func TestGetUserByIDNotFound(t *testing.T) {
	users := []User{
		{ID: 1, Name: "Alice", Email: "alice@example.com"},
	}

	user := GetUserByID(999, users)
	if user != nil {
		t.Error("Expected nil for non-existent user")
	}
}

func TestCreateUser(t *testing.T) {
	user := CreateUser("Charlie", "charlie@example.com")
	if user.Name != "Charlie" {
		t.Errorf("Expected Charlie, got %s", user.Name)
	}
	if user.Email != "charlie@example.com" {
		t.Errorf("Expected charlie@example.com, got %s", user.Email)
	}
}

func BenchmarkGetUserByID(b *testing.B) {
	users := []User{
		{ID: 1, Name: "Alice", Email: "alice@example.com"},
		{ID: 2, Name: "Bob", Email: "bob@example.com"},
	}

	for i := 0; i < b.N; i++ {
		GetUserByID(1, users)
	}
}
