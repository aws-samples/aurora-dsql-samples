// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package store

import (
	"context"

	"github.com/aws-samples/recipe-share-dsql-go/internal/model"
)

// Store defines the database operations for the recipe sharing API.
// Both the SQLite (local development) and Amazon Aurora DSQL (production)
// implementations satisfy this interface.
type Store interface {
	// InitSchema creates the database tables if they do not already exist.
	InitSchema(ctx context.Context) error

	// Close releases any resources held by the store.
	Close() error

	// Chef operations
	ListChefs(ctx context.Context) ([]model.Chef, error)
	GetChef(ctx context.Context, id string) (*model.Chef, error)
	GetChefWithRecipes(ctx context.Context, id string) (*model.ChefWithRecipes, error)
	CreateChef(ctx context.Context, input model.CreateChefInput) (*model.Chef, error)
	UpdateChef(ctx context.Context, id string, input model.UpdateChefInput) (*model.Chef, error)
	DeleteChef(ctx context.Context, id string) error

	// Recipe operations
	ListRecipes(ctx context.Context, filter model.RecipeFilter) ([]model.Recipe, error)
	GetRecipe(ctx context.Context, id string) (*model.Recipe, error)
	GetRecipeWithRatings(ctx context.Context, id string) (*model.RecipeWithRatings, error)
	CreateRecipe(ctx context.Context, input model.CreateRecipeInput) (*model.Recipe, error)
	UpdateRecipe(ctx context.Context, id string, input model.UpdateRecipeInput) (*model.Recipe, error)
	DeleteRecipe(ctx context.Context, id string) error

	// Rating operations
	ListRatings(ctx context.Context, recipeID string) ([]model.Rating, error)
	CreateRating(ctx context.Context, recipeID string, input model.CreateRatingInput) (*model.Rating, error)
}
