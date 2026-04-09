// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package test

import (
	"context"
	"os"
	"testing"

	"github.com/aws-samples/recipe-share-dsql-go/internal/model"
	"github.com/aws-samples/recipe-share-dsql-go/internal/store"
)

func setupStore(t *testing.T) (*store.DSQLStore, context.Context) {
	t.Helper()
	endpoint := os.Getenv("CLUSTER_ENDPOINT")
	if endpoint == "" {
		t.Fatal("CLUSTER_ENDPOINT environment variable is required")
	}
	ctx := context.Background()
	s, err := store.NewDSQLStore(ctx, endpoint)
	if err != nil {
		t.Fatalf("NewDSQLStore: %v", err)
	}
	if err := s.InitSchema(ctx); err != nil {
		t.Fatalf("InitSchema: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s, ctx
}

func ptr[T any](v T) *T { return &v }

func TestChefCRUD(t *testing.T) {
	s, ctx := setupStore(t)

	// Create
	chef, err := s.CreateChef(ctx, model.CreateChefInput{
		Name:      "Test Chef",
		Email:     "test@example.com",
		Specialty: "Italian",
		Bio:       "A test chef",
	})
	if err != nil {
		t.Fatalf("CreateChef: %v", err)
	}
	if chef.Name != "Test Chef" {
		t.Errorf("expected name 'Test Chef', got %q", chef.Name)
	}
	t.Cleanup(func() { s.DeleteChef(ctx, chef.ID) })

	// Get
	got, err := s.GetChef(ctx, chef.ID)
	if err != nil {
		t.Fatalf("GetChef: %v", err)
	}
	if got == nil || got.ID != chef.ID {
		t.Fatalf("GetChef returned unexpected result: %v", got)
	}

	// Update
	updated, err := s.UpdateChef(ctx, chef.ID, model.UpdateChefInput{
		Name: ptr("Updated Chef"),
	})
	if err != nil {
		t.Fatalf("UpdateChef: %v", err)
	}
	if updated.Name != "Updated Chef" {
		t.Errorf("expected updated name, got %q", updated.Name)
	}

	// List
	chefs, err := s.ListChefs(ctx)
	if err != nil {
		t.Fatalf("ListChefs: %v", err)
	}
	found := false
	for _, c := range chefs {
		if c.ID == chef.ID {
			found = true
		}
	}
	if !found {
		t.Error("created chef not found in ListChefs")
	}

	// Delete
	if err := s.DeleteChef(ctx, chef.ID); err != nil {
		t.Fatalf("DeleteChef: %v", err)
	}
	deleted, err := s.GetChef(ctx, chef.ID)
	if err != nil {
		t.Fatalf("GetChef after delete: %v", err)
	}
	if deleted != nil {
		t.Error("chef still exists after delete")
	}
}

func TestRecipeCRUD(t *testing.T) {
	s, ctx := setupStore(t)

	chef, err := s.CreateChef(ctx, model.CreateChefInput{
		Name:  "Recipe Test Chef",
		Email: "recipe-chef@example.com",
	})
	if err != nil {
		t.Fatalf("CreateChef: %v", err)
	}
	t.Cleanup(func() { s.DeleteChef(ctx, chef.ID) })

	// Create
	recipe, err := s.CreateRecipe(ctx, model.CreateRecipeInput{
		ChefID:       chef.ID,
		Title:        "Test Pasta",
		Ingredients:  "pasta, sauce",
		Instructions: "boil and mix",
		Difficulty:   "easy",
		Cuisine:      "Italian",
	})
	if err != nil {
		t.Fatalf("CreateRecipe: %v", err)
	}
	if recipe.Title != "Test Pasta" {
		t.Errorf("expected title 'Test Pasta', got %q", recipe.Title)
	}
	t.Cleanup(func() { s.DeleteRecipe(ctx, recipe.ID) })

	// Get
	got, err := s.GetRecipe(ctx, recipe.ID)
	if err != nil {
		t.Fatalf("GetRecipe: %v", err)
	}
	if got == nil || got.ID != recipe.ID {
		t.Fatalf("GetRecipe returned unexpected result")
	}

	// Update
	updated, err := s.UpdateRecipe(ctx, recipe.ID, model.UpdateRecipeInput{
		Title: ptr("Updated Pasta"),
	})
	if err != nil {
		t.Fatalf("UpdateRecipe: %v", err)
	}
	if updated.Title != "Updated Pasta" {
		t.Errorf("expected updated title, got %q", updated.Title)
	}

	// List with filter
	recipes, err := s.ListRecipes(ctx, model.RecipeFilter{Cuisine: "Italian"})
	if err != nil {
		t.Fatalf("ListRecipes: %v", err)
	}
	found := false
	for _, r := range recipes {
		if r.ID == recipe.ID {
			found = true
		}
	}
	if !found {
		t.Error("created recipe not found in filtered ListRecipes")
	}

	// Delete
	if err := s.DeleteRecipe(ctx, recipe.ID); err != nil {
		t.Fatalf("DeleteRecipe: %v", err)
	}
	deleted, err := s.GetRecipe(ctx, recipe.ID)
	if err != nil {
		t.Fatalf("GetRecipe after delete: %v", err)
	}
	if deleted != nil {
		t.Error("recipe still exists after delete")
	}
}

func TestRatingCRUD(t *testing.T) {
	s, ctx := setupStore(t)

	chef, err := s.CreateChef(ctx, model.CreateChefInput{
		Name:  "Rating Test Chef",
		Email: "rating-chef@example.com",
	})
	if err != nil {
		t.Fatalf("CreateChef: %v", err)
	}
	t.Cleanup(func() { s.DeleteChef(ctx, chef.ID) })

	recipe, err := s.CreateRecipe(ctx, model.CreateRecipeInput{
		ChefID:       chef.ID,
		Title:        "Rated Recipe",
		Ingredients:  "stuff",
		Instructions: "do things",
	})
	if err != nil {
		t.Fatalf("CreateRecipe: %v", err)
	}
	t.Cleanup(func() { s.DeleteRecipe(ctx, recipe.ID) })

	// Create rating
	rating, err := s.CreateRating(ctx, recipe.ID, model.CreateRatingInput{
		ChefID:  chef.ID,
		Score:   5,
		Comment: "Excellent!",
	})
	if err != nil {
		t.Fatalf("CreateRating: %v", err)
	}
	if rating.Score != 5 {
		t.Errorf("expected score 5, got %d", rating.Score)
	}

	// List ratings
	ratings, err := s.ListRatings(ctx, recipe.ID)
	if err != nil {
		t.Fatalf("ListRatings: %v", err)
	}
	if len(ratings) != 1 || ratings[0].ID != rating.ID {
		t.Errorf("expected 1 rating, got %d", len(ratings))
	}
}

func TestGetChefWithRecipes(t *testing.T) {
	s, ctx := setupStore(t)

	chef, err := s.CreateChef(ctx, model.CreateChefInput{
		Name:  "Chef With Recipes",
		Email: "chef-recipes@example.com",
	})
	if err != nil {
		t.Fatalf("CreateChef: %v", err)
	}
	t.Cleanup(func() { s.DeleteChef(ctx, chef.ID) })

	recipe, err := s.CreateRecipe(ctx, model.CreateRecipeInput{
		ChefID:       chef.ID,
		Title:        "Chef Special",
		Ingredients:  "secret",
		Instructions: "carefully prepare",
	})
	if err != nil {
		t.Fatalf("CreateRecipe: %v", err)
	}
	t.Cleanup(func() { s.DeleteRecipe(ctx, recipe.ID) })

	result, err := s.GetChefWithRecipes(ctx, chef.ID)
	if err != nil {
		t.Fatalf("GetChefWithRecipes: %v", err)
	}
	if result.ID != chef.ID {
		t.Error("wrong chef returned")
	}
	if len(result.Recipes) != 1 || result.Recipes[0].ID != recipe.ID {
		t.Errorf("expected 1 recipe, got %d", len(result.Recipes))
	}
}

func TestGetRecipeWithRatings(t *testing.T) {
	s, ctx := setupStore(t)

	chef, err := s.CreateChef(ctx, model.CreateChefInput{
		Name:  "Ratings Chef",
		Email: "ratings-chef@example.com",
	})
	if err != nil {
		t.Fatalf("CreateChef: %v", err)
	}
	t.Cleanup(func() { s.DeleteChef(ctx, chef.ID) })

	recipe, err := s.CreateRecipe(ctx, model.CreateRecipeInput{
		ChefID:       chef.ID,
		Title:        "Highly Rated",
		Ingredients:  "quality ingredients",
		Instructions: "cook well",
	})
	if err != nil {
		t.Fatalf("CreateRecipe: %v", err)
	}
	t.Cleanup(func() { s.DeleteRecipe(ctx, recipe.ID) })

	_, err = s.CreateRating(ctx, recipe.ID, model.CreateRatingInput{
		ChefID: chef.ID, Score: 4, Comment: "Great",
	})
	if err != nil {
		t.Fatalf("CreateRating: %v", err)
	}
	_, err = s.CreateRating(ctx, recipe.ID, model.CreateRatingInput{
		ChefID: chef.ID, Score: 5, Comment: "Amazing",
	})
	if err != nil {
		t.Fatalf("CreateRating: %v", err)
	}

	result, err := s.GetRecipeWithRatings(ctx, recipe.ID)
	if err != nil {
		t.Fatalf("GetRecipeWithRatings: %v", err)
	}
	if result.RatingCount != 2 {
		t.Errorf("expected 2 ratings, got %d", result.RatingCount)
	}
	if result.AverageScore != 4.5 {
		t.Errorf("expected average 4.5, got %f", result.AverageScore)
	}
}
