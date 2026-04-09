// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package model

import "time"

// Rating represents a review of a recipe by a chef.
type Rating struct {
	ID        string    `json:"id"`
	RecipeID  string    `json:"recipe_id"`
	ChefID    string    `json:"chef_id"`
	Score     int       `json:"score"`
	Comment   string    `json:"comment,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// CreateRatingInput holds the fields required to create a new rating.
type CreateRatingInput struct {
	ChefID  string `json:"chef_id" binding:"required"`
	Score   int    `json:"score" binding:"required,min=1,max=5"`
	Comment string `json:"comment,omitempty"`
}
