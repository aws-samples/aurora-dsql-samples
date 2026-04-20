// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/aws-samples/recipe-share-dsql-go/internal/model"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// SQLiteStore implements the Store interface using SQLite for local development.
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore opens a SQLite database at the given path and returns a store.
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	// Enable WAL mode for better concurrent read performance.
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("set WAL mode: %w", err)
	}

	return &SQLiteStore{db: db}, nil
}

// InitSchema creates the chefs, recipes, and ratings tables if they do not exist.
func (s *SQLiteStore) InitSchema(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS chefs (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			specialty TEXT DEFAULT '',
			bio TEXT DEFAULT '',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS recipes (
			id TEXT PRIMARY KEY,
			chef_id TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT DEFAULT '',
			ingredients TEXT NOT NULL,
			instructions TEXT NOT NULL,
			prep_time INTEGER DEFAULT 0,
			cook_time INTEGER DEFAULT 0,
			servings INTEGER DEFAULT 0,
			difficulty TEXT NOT NULL DEFAULT 'medium',
			cuisine TEXT DEFAULT '',
			status TEXT NOT NULL DEFAULT 'draft',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS ratings (
			id TEXT PRIMARY KEY,
			recipe_id TEXT NOT NULL,
			chef_id TEXT NOT NULL,
			score INTEGER NOT NULL,
			comment TEXT DEFAULT '',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)`,
	}

	for _, stmt := range statements {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("init schema: %w", err)
		}
	}
	return nil
}

// Close closes the underlying SQLite database connection.
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

// ---------------------------------------------------------------------------
// Chef operations
// ---------------------------------------------------------------------------

// ListChefs returns all chefs ordered by creation date.
func (s *SQLiteStore) ListChefs(ctx context.Context) ([]model.Chef, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, email, specialty, bio, created_at, updated_at
		 FROM chefs ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list chefs: %w", err)
	}
	defer rows.Close()

	var chefs []model.Chef
	for rows.Next() {
		var c model.Chef
		if err := rows.Scan(&c.ID, &c.Name, &c.Email, &c.Specialty, &c.Bio, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan chef: %w", err)
		}
		chefs = append(chefs, c)
	}
	return chefs, rows.Err()
}

// GetChef returns a single chef by ID, or nil if not found.
func (s *SQLiteStore) GetChef(ctx context.Context, id string) (*model.Chef, error) {
	var c model.Chef
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, email, specialty, bio, created_at, updated_at
		 FROM chefs WHERE id = ?`, id).
		Scan(&c.ID, &c.Name, &c.Email, &c.Specialty, &c.Bio, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get chef: %w", err)
	}
	return &c, nil
}

// GetChefWithRecipes returns a chef with their associated recipes.
func (s *SQLiteStore) GetChefWithRecipes(ctx context.Context, id string) (*model.ChefWithRecipes, error) {
	chef, err := s.GetChef(ctx, id)
	if err != nil || chef == nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT id, chef_id, title, description, ingredients, instructions,
		        prep_time, cook_time, servings, difficulty, cuisine, status,
		        created_at, updated_at
		 FROM recipes WHERE chef_id = ? ORDER BY created_at DESC`, id)
	if err != nil {
		return nil, fmt.Errorf("get chef recipes: %w", err)
	}
	defer rows.Close()

	result := &model.ChefWithRecipes{Chef: *chef}
	for rows.Next() {
		var r model.Recipe
		if err := rows.Scan(&r.ID, &r.ChefID, &r.Title, &r.Description,
			&r.Ingredients, &r.Instructions, &r.PrepTime, &r.CookTime,
			&r.Servings, &r.Difficulty, &r.Cuisine, &r.Status,
			&r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan recipe: %w", err)
		}
		result.Recipes = append(result.Recipes, r)
	}
	if result.Recipes == nil {
		result.Recipes = []model.Recipe{}
	}
	return result, rows.Err()
}

// CreateChef inserts a new chef record with a generated UUID.
func (s *SQLiteStore) CreateChef(ctx context.Context, input model.CreateChefInput) (*model.Chef, error) {
	now := time.Now().UTC()
	c := model.Chef{
		ID:        uuid.New().String(),
		Name:      input.Name,
		Email:     input.Email,
		Specialty: input.Specialty,
		Bio:       input.Bio,
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO chefs (id, name, email, specialty, bio, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.Name, c.Email, c.Specialty, c.Bio, c.CreatedAt, c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create chef: %w", err)
	}
	return &c, nil
}

// UpdateChef applies partial updates to an existing chef.
func (s *SQLiteStore) UpdateChef(ctx context.Context, id string, input model.UpdateChefInput) (*model.Chef, error) {
	chef, err := s.GetChef(ctx, id)
	if err != nil || chef == nil {
		return nil, err
	}

	if input.Name != nil {
		chef.Name = *input.Name
	}
	if input.Email != nil {
		chef.Email = *input.Email
	}
	if input.Specialty != nil {
		chef.Specialty = *input.Specialty
	}
	if input.Bio != nil {
		chef.Bio = *input.Bio
	}
	chef.UpdatedAt = time.Now().UTC()

	_, err = s.db.ExecContext(ctx,
		`UPDATE chefs SET name = ?, email = ?, specialty = ?, bio = ?, updated_at = ?
		 WHERE id = ?`,
		chef.Name, chef.Email, chef.Specialty, chef.Bio, chef.UpdatedAt, id)
	if err != nil {
		return nil, fmt.Errorf("update chef: %w", err)
	}
	return chef, nil
}

// DeleteChef removes a chef by ID from the SQLite database.
func (s *SQLiteStore) DeleteChef(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM chefs WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete chef: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Recipe operations
// ---------------------------------------------------------------------------

// ListRecipes returns recipes matching the optional filter criteria.
func (s *SQLiteStore) ListRecipes(ctx context.Context, filter model.RecipeFilter) ([]model.Recipe, error) {
	query := `SELECT id, chef_id, title, description, ingredients, instructions,
	                  prep_time, cook_time, servings, difficulty, cuisine, status,
	                  created_at, updated_at
	           FROM recipes WHERE 1=1`
	var args []any

	if filter.Cuisine != "" {
		query += " AND cuisine = ?"
		args = append(args, filter.Cuisine)
	}
	if filter.Difficulty != "" {
		query += " AND difficulty = ?"
		args = append(args, filter.Difficulty)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	query += " ORDER BY created_at DESC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list recipes: %w", err)
	}
	defer rows.Close()

	var recipes []model.Recipe
	for rows.Next() {
		var r model.Recipe
		if err := rows.Scan(&r.ID, &r.ChefID, &r.Title, &r.Description,
			&r.Ingredients, &r.Instructions, &r.PrepTime, &r.CookTime,
			&r.Servings, &r.Difficulty, &r.Cuisine, &r.Status,
			&r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan recipe: %w", err)
		}
		recipes = append(recipes, r)
	}
	return recipes, rows.Err()
}

// GetRecipe returns a single recipe by ID, or nil if not found.
func (s *SQLiteStore) GetRecipe(ctx context.Context, id string) (*model.Recipe, error) {
	var r model.Recipe
	err := s.db.QueryRowContext(ctx,
		`SELECT id, chef_id, title, description, ingredients, instructions,
		        prep_time, cook_time, servings, difficulty, cuisine, status,
		        created_at, updated_at
		 FROM recipes WHERE id = ?`, id).
		Scan(&r.ID, &r.ChefID, &r.Title, &r.Description,
			&r.Ingredients, &r.Instructions, &r.PrepTime, &r.CookTime,
			&r.Servings, &r.Difficulty, &r.Cuisine, &r.Status,
			&r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get recipe: %w", err)
	}
	return &r, nil
}

// GetRecipeWithRatings returns a recipe with its ratings and computed average score.
func (s *SQLiteStore) GetRecipeWithRatings(ctx context.Context, id string) (*model.RecipeWithRatings, error) {
	recipe, err := s.GetRecipe(ctx, id)
	if err != nil || recipe == nil {
		return nil, err
	}

	ratings, err := s.ListRatings(ctx, id)
	if err != nil {
		return nil, err
	}
	if ratings == nil {
		ratings = []model.Rating{}
	}

	// Calculate average score.
	var total int
	for _, r := range ratings {
		total += r.Score
	}
	var avg float64
	if len(ratings) > 0 {
		avg = float64(total) / float64(len(ratings))
	}

	return &model.RecipeWithRatings{
		Recipe:       *recipe,
		Ratings:      ratings,
		AverageScore: avg,
		RatingCount:  len(ratings),
	}, nil
}

// CreateRecipe inserts a new recipe record with a generated UUID.
func (s *SQLiteStore) CreateRecipe(ctx context.Context, input model.CreateRecipeInput) (*model.Recipe, error) {
	now := time.Now().UTC()

	difficulty := input.Difficulty
	if difficulty == "" {
		difficulty = "medium"
	}
	status := input.Status
	if status == "" {
		status = "draft"
	}

	r := model.Recipe{
		ID:           uuid.New().String(),
		ChefID:       input.ChefID,
		Title:        input.Title,
		Description:  input.Description,
		Ingredients:  input.Ingredients,
		Instructions: input.Instructions,
		PrepTime:     input.PrepTime,
		CookTime:     input.CookTime,
		Servings:     input.Servings,
		Difficulty:   difficulty,
		Cuisine:      input.Cuisine,
		Status:       status,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO recipes (id, chef_id, title, description, ingredients, instructions,
		                      prep_time, cook_time, servings, difficulty, cuisine, status,
		                      created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.ChefID, r.Title, r.Description, r.Ingredients, r.Instructions,
		r.PrepTime, r.CookTime, r.Servings, r.Difficulty, r.Cuisine, r.Status,
		r.CreatedAt, r.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create recipe: %w", err)
	}
	return &r, nil
}

// UpdateRecipe applies partial updates to an existing recipe.
func (s *SQLiteStore) UpdateRecipe(ctx context.Context, id string, input model.UpdateRecipeInput) (*model.Recipe, error) {
	recipe, err := s.GetRecipe(ctx, id)
	if err != nil || recipe == nil {
		return nil, err
	}

	if input.Title != nil {
		recipe.Title = *input.Title
	}
	if input.Description != nil {
		recipe.Description = *input.Description
	}
	if input.Ingredients != nil {
		recipe.Ingredients = *input.Ingredients
	}
	if input.Instructions != nil {
		recipe.Instructions = *input.Instructions
	}
	if input.PrepTime != nil {
		recipe.PrepTime = *input.PrepTime
	}
	if input.CookTime != nil {
		recipe.CookTime = *input.CookTime
	}
	if input.Servings != nil {
		recipe.Servings = *input.Servings
	}
	if input.Difficulty != nil {
		recipe.Difficulty = *input.Difficulty
	}
	if input.Cuisine != nil {
		recipe.Cuisine = *input.Cuisine
	}
	if input.Status != nil {
		recipe.Status = *input.Status
	}
	recipe.UpdatedAt = time.Now().UTC()

	_, err = s.db.ExecContext(ctx,
		`UPDATE recipes SET title = ?, description = ?, ingredients = ?, instructions = ?,
		        prep_time = ?, cook_time = ?, servings = ?, difficulty = ?, cuisine = ?,
		        status = ?, updated_at = ?
		 WHERE id = ?`,
		recipe.Title, recipe.Description, recipe.Ingredients, recipe.Instructions,
		recipe.PrepTime, recipe.CookTime, recipe.Servings, recipe.Difficulty, recipe.Cuisine,
		recipe.Status, recipe.UpdatedAt, id)
	if err != nil {
		return nil, fmt.Errorf("update recipe: %w", err)
	}
	return recipe, nil
}

// DeleteRecipe removes a recipe by ID from the SQLite database.
func (s *SQLiteStore) DeleteRecipe(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM recipes WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete recipe: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Rating operations
// ---------------------------------------------------------------------------

// ListRatings returns all ratings for a given recipe.
func (s *SQLiteStore) ListRatings(ctx context.Context, recipeID string) ([]model.Rating, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, recipe_id, chef_id, score, comment, created_at, updated_at
		 FROM ratings WHERE recipe_id = ? ORDER BY created_at DESC`, recipeID)
	if err != nil {
		return nil, fmt.Errorf("list ratings: %w", err)
	}
	defer rows.Close()

	var ratings []model.Rating
	for rows.Next() {
		var r model.Rating
		if err := rows.Scan(&r.ID, &r.RecipeID, &r.ChefID, &r.Score, &r.Comment, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan rating: %w", err)
		}
		ratings = append(ratings, r)
	}
	return ratings, rows.Err()
}

// CreateRating inserts a new rating record with a generated UUID.
func (s *SQLiteStore) CreateRating(ctx context.Context, recipeID string, input model.CreateRatingInput) (*model.Rating, error) {
	now := time.Now().UTC()
	r := model.Rating{
		ID:        uuid.New().String(),
		RecipeID:  recipeID,
		ChefID:    input.ChefID,
		Score:     input.Score,
		Comment:   input.Comment,
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO ratings (id, recipe_id, chef_id, score, comment, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.RecipeID, r.ChefID, r.Score, r.Comment, r.CreatedAt, r.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create rating: %w", err)
	}
	return &r, nil
}
