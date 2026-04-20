// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package model

import "time"

// Recipe represents a dish with ingredients, instructions, and metadata.
type Recipe struct {
	ID           string    `json:"id"`
	ChefID       string    `json:"chef_id"`
	Title        string    `json:"title"`
	Description  string    `json:"description,omitempty"`
	Ingredients  string    `json:"ingredients"`
	Instructions string    `json:"instructions"`
	PrepTime     int       `json:"prep_time,omitempty"`
	CookTime     int       `json:"cook_time,omitempty"`
	Servings     int       `json:"servings,omitempty"`
	Difficulty   string    `json:"difficulty"`
	Cuisine      string    `json:"cuisine,omitempty"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// RecipeWithRatings includes a recipe along with its ratings and average score.
type RecipeWithRatings struct {
	Recipe
	Ratings      []Rating `json:"ratings"`
	AverageScore float64  `json:"average_score"`
	RatingCount  int      `json:"rating_count"`
}

// CreateRecipeInput holds the fields required to create a new recipe.
type CreateRecipeInput struct {
	ChefID       string `json:"chef_id" binding:"required"`
	Title        string `json:"title" binding:"required"`
	Description  string `json:"description,omitempty"`
	Ingredients  string `json:"ingredients" binding:"required"`
	Instructions string `json:"instructions" binding:"required"`
	PrepTime     int    `json:"prep_time,omitempty"`
	CookTime     int    `json:"cook_time,omitempty"`
	Servings     int    `json:"servings,omitempty"`
	Difficulty   string `json:"difficulty,omitempty"`
	Cuisine      string `json:"cuisine,omitempty"`
	Status       string `json:"status,omitempty"`
}

// UpdateRecipeInput holds the fields that can be updated on a recipe.
type UpdateRecipeInput struct {
	Title        *string `json:"title,omitempty"`
	Description  *string `json:"description,omitempty"`
	Ingredients  *string `json:"ingredients,omitempty"`
	Instructions *string `json:"instructions,omitempty"`
	PrepTime     *int    `json:"prep_time,omitempty"`
	CookTime     *int    `json:"cook_time,omitempty"`
	Servings     *int    `json:"servings,omitempty"`
	Difficulty   *string `json:"difficulty,omitempty"`
	Cuisine      *string `json:"cuisine,omitempty"`
	Status       *string `json:"status,omitempty"`
}

// RecipeFilter holds optional query parameters for filtering recipes.
type RecipeFilter struct {
	Cuisine    string
	Difficulty string
	Status     string
}

// Valid difficulty levels for recipes.
var ValidDifficulties = []string{"easy", "medium", "hard"}

// Valid status values for recipes.
var ValidStatuses = []string{"draft", "published", "archived"}
