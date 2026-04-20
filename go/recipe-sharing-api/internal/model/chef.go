// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package model

import "time"

// Chef represents a person who creates and shares recipes.
type Chef struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Specialty string    `json:"specialty,omitempty"`
	Bio       string    `json:"bio,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ChefWithRecipes includes a chef's profile along with their recipes.
type ChefWithRecipes struct {
	Chef
	Recipes []Recipe `json:"recipes"`
}

// CreateChefInput holds the fields required to create a new chef.
type CreateChefInput struct {
	Name      string `json:"name" binding:"required"`
	Email     string `json:"email" binding:"required,email"`
	Specialty string `json:"specialty,omitempty"`
	Bio       string `json:"bio,omitempty"`
}

// UpdateChefInput holds the fields that can be updated on a chef.
type UpdateChefInput struct {
	Name      *string `json:"name,omitempty"`
	Email     *string `json:"email,omitempty" binding:"omitempty,email"`
	Specialty *string `json:"specialty,omitempty"`
	Bio       *string `json:"bio,omitempty"`
}
