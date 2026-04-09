// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package store

import (
	"context"
	"fmt"
	"time"

	"github.com/aws-samples/recipe-share-dsql-go/internal/model"
	"github.com/awslabs/aurora-dsql-connectors/go/pgx/dsql"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const schemaName = "recipe_share"

// DSQLStore implements the Store interface using Amazon Aurora DSQL.
type DSQLStore struct {
	pool *pgxpool.Pool
}

// NewDSQLStore creates a connection pool to Amazon Aurora DSQL using IAM
// token-based authentication via the official Aurora DSQL Go connector.
func NewDSQLStore(ctx context.Context, endpoint string) (*DSQLStore, error) {
	// Configure pool limits appropriate for Lambda concurrency.
	poolCfg, err := pgxpool.ParseConfig("")
	if err != nil {
		return nil, fmt.Errorf("parse pool config: %w", err)
	}
	poolCfg.MaxConns = 5
	poolCfg.MinConns = 1
	poolCfg.MaxConnLifetime = 50 * time.Minute // Amazon Aurora DSQL timeout is 60 min.

	// Create a connection pool using the Aurora DSQL connector.
	// The connector handles IAM token generation, SSL/TLS configuration,
	// and the prefer_simple_protocol setting automatically.
	pool, err := dsql.NewPool(ctx, dsql.Config{
		Host: endpoint,
	}, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create Aurora DSQL connection pool: %w", err)
	}

	return &DSQLStore{pool: pool}, nil
}

// InitSchema creates the recipe_share schema and tables if they do not exist.
// Each DDL statement runs in its own transaction because Amazon Aurora DSQL
// does not support DDL and DML in the same transaction.
func (s *DSQLStore) InitSchema(ctx context.Context) error {
	statements := []string{
		fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schemaName),
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.chefs (
			id TEXT PRIMARY KEY,
			name VARCHAR(100) NOT NULL,
			email VARCHAR(255) NOT NULL,
			specialty VARCHAR(100) DEFAULT '',
			bio TEXT DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`, schemaName),
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.recipes (
			id TEXT PRIMARY KEY,
			chef_id TEXT NOT NULL,
			title VARCHAR(200) NOT NULL,
			description TEXT DEFAULT '',
			ingredients TEXT NOT NULL,
			instructions TEXT NOT NULL,
			prep_time INTEGER DEFAULT 0,
			cook_time INTEGER DEFAULT 0,
			servings INTEGER DEFAULT 0,
			difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
			cuisine VARCHAR(50) DEFAULT '',
			status VARCHAR(20) NOT NULL DEFAULT 'draft',
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`, schemaName),
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s.ratings (
			id TEXT PRIMARY KEY,
			recipe_id TEXT NOT NULL,
			chef_id TEXT NOT NULL,
			score INTEGER NOT NULL,
			comment TEXT DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL
		)`, schemaName),
	}

	for _, stmt := range statements {
		if _, err := s.pool.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("init schema: %w", err)
		}
	}
	return nil
}

// Close releases the connection pool.
func (s *DSQLStore) Close() error {
	s.pool.Close()
	return nil
}

// ---------------------------------------------------------------------------
// Chef operations
// ---------------------------------------------------------------------------

// ListChefs returns all chefs from Amazon Aurora DSQL ordered by creation date.
func (s *DSQLStore) ListChefs(ctx context.Context) ([]model.Chef, error) {
	rows, err := s.pool.Query(ctx,
		fmt.Sprintf(`SELECT id, name, email, specialty, bio, created_at, updated_at
		 FROM %s.chefs ORDER BY created_at DESC`, schemaName))
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

// GetChef returns a single chef by ID from Amazon Aurora DSQL, or nil if not found.
func (s *DSQLStore) GetChef(ctx context.Context, id string) (*model.Chef, error) {
	var c model.Chef
	err := s.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT id, name, email, specialty, bio, created_at, updated_at
		 FROM %s.chefs WHERE id = $1`, schemaName), id).
		Scan(&c.ID, &c.Name, &c.Email, &c.Specialty, &c.Bio, &c.CreatedAt, &c.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get chef: %w", err)
	}
	return &c, nil
}

// GetChefWithRecipes returns a chef with their associated recipes from Amazon Aurora DSQL.
func (s *DSQLStore) GetChefWithRecipes(ctx context.Context, id string) (*model.ChefWithRecipes, error) {
	chef, err := s.GetChef(ctx, id)
	if err != nil || chef == nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx,
		fmt.Sprintf(`SELECT id, chef_id, title, description, ingredients, instructions,
		        prep_time, cook_time, servings, difficulty, cuisine, status,
		        created_at, updated_at
		 FROM %s.recipes WHERE chef_id = $1 ORDER BY created_at DESC`, schemaName), id)
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

// CreateChef inserts a new chef record into Amazon Aurora DSQL with a generated UUID.
func (s *DSQLStore) CreateChef(ctx context.Context, input model.CreateChefInput) (*model.Chef, error) {
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

	_, err := s.pool.Exec(ctx,
		fmt.Sprintf(`INSERT INTO %s.chefs (id, name, email, specialty, bio, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`, schemaName),
		c.ID, c.Name, c.Email, c.Specialty, c.Bio, c.CreatedAt, c.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create chef: %w", err)
	}
	return &c, nil
}

// UpdateChef applies partial updates to an existing chef in Amazon Aurora DSQL.
func (s *DSQLStore) UpdateChef(ctx context.Context, id string, input model.UpdateChefInput) (*model.Chef, error) {
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

	_, err = s.pool.Exec(ctx,
		fmt.Sprintf(`UPDATE %s.chefs SET name = $1, email = $2, specialty = $3, bio = $4, updated_at = $5
		 WHERE id = $6`, schemaName),
		chef.Name, chef.Email, chef.Specialty, chef.Bio, chef.UpdatedAt, id)
	if err != nil {
		return nil, fmt.Errorf("update chef: %w", err)
	}
	return chef, nil
}

// DeleteChef removes a chef by ID from Amazon Aurora DSQL.
func (s *DSQLStore) DeleteChef(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		fmt.Sprintf(`DELETE FROM %s.chefs WHERE id = $1`, schemaName), id)
	if err != nil {
		return fmt.Errorf("delete chef: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Recipe operations
// ---------------------------------------------------------------------------

// ListRecipes returns recipes from Amazon Aurora DSQL matching the optional filter criteria.
func (s *DSQLStore) ListRecipes(ctx context.Context, filter model.RecipeFilter) ([]model.Recipe, error) {
	query := fmt.Sprintf(`SELECT id, chef_id, title, description, ingredients, instructions,
	                  prep_time, cook_time, servings, difficulty, cuisine, status,
	                  created_at, updated_at
	           FROM %s.recipes WHERE 1=1`, schemaName)
	var args []any
	argIdx := 1

	if filter.Cuisine != "" {
		query += fmt.Sprintf(" AND cuisine = $%d", argIdx)
		args = append(args, filter.Cuisine)
		argIdx++
	}
	if filter.Difficulty != "" {
		query += fmt.Sprintf(" AND difficulty = $%d", argIdx)
		args = append(args, filter.Difficulty)
		argIdx++
	}
	if filter.Status != "" {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, filter.Status)
		argIdx++
	}
	query += " ORDER BY created_at DESC"

	rows, err := s.pool.Query(ctx, query, args...)
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

// GetRecipe returns a single recipe by ID from Amazon Aurora DSQL, or nil if not found.
func (s *DSQLStore) GetRecipe(ctx context.Context, id string) (*model.Recipe, error) {
	var r model.Recipe
	err := s.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT id, chef_id, title, description, ingredients, instructions,
		        prep_time, cook_time, servings, difficulty, cuisine, status,
		        created_at, updated_at
		 FROM %s.recipes WHERE id = $1`, schemaName), id).
		Scan(&r.ID, &r.ChefID, &r.Title, &r.Description,
			&r.Ingredients, &r.Instructions, &r.PrepTime, &r.CookTime,
			&r.Servings, &r.Difficulty, &r.Cuisine, &r.Status,
			&r.CreatedAt, &r.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get recipe: %w", err)
	}
	return &r, nil
}

// GetRecipeWithRatings returns a recipe with its ratings and computed average score from Amazon Aurora DSQL.
func (s *DSQLStore) GetRecipeWithRatings(ctx context.Context, id string) (*model.RecipeWithRatings, error) {
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

// CreateRecipe inserts a new recipe record into Amazon Aurora DSQL with a generated UUID.
func (s *DSQLStore) CreateRecipe(ctx context.Context, input model.CreateRecipeInput) (*model.Recipe, error) {
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

	_, err := s.pool.Exec(ctx,
		fmt.Sprintf(`INSERT INTO %s.recipes (id, chef_id, title, description, ingredients, instructions,
		                      prep_time, cook_time, servings, difficulty, cuisine, status,
		                      created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, schemaName),
		r.ID, r.ChefID, r.Title, r.Description, r.Ingredients, r.Instructions,
		r.PrepTime, r.CookTime, r.Servings, r.Difficulty, r.Cuisine, r.Status,
		r.CreatedAt, r.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create recipe: %w", err)
	}
	return &r, nil
}

// UpdateRecipe applies partial updates to an existing recipe in Amazon Aurora DSQL.
func (s *DSQLStore) UpdateRecipe(ctx context.Context, id string, input model.UpdateRecipeInput) (*model.Recipe, error) {
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

	_, err = s.pool.Exec(ctx,
		fmt.Sprintf(`UPDATE %s.recipes SET title = $1, description = $2, ingredients = $3, instructions = $4,
		        prep_time = $5, cook_time = $6, servings = $7, difficulty = $8, cuisine = $9,
		        status = $10, updated_at = $11
		 WHERE id = $12`, schemaName),
		recipe.Title, recipe.Description, recipe.Ingredients, recipe.Instructions,
		recipe.PrepTime, recipe.CookTime, recipe.Servings, recipe.Difficulty, recipe.Cuisine,
		recipe.Status, recipe.UpdatedAt, id)
	if err != nil {
		return nil, fmt.Errorf("update recipe: %w", err)
	}
	return recipe, nil
}

// DeleteRecipe removes a recipe by ID from Amazon Aurora DSQL.
func (s *DSQLStore) DeleteRecipe(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		fmt.Sprintf(`DELETE FROM %s.recipes WHERE id = $1`, schemaName), id)
	if err != nil {
		return fmt.Errorf("delete recipe: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Rating operations
// ---------------------------------------------------------------------------

// ListRatings returns all ratings for a given recipe from Amazon Aurora DSQL.
func (s *DSQLStore) ListRatings(ctx context.Context, recipeID string) ([]model.Rating, error) {
	rows, err := s.pool.Query(ctx,
		fmt.Sprintf(`SELECT id, recipe_id, chef_id, score, comment, created_at, updated_at
		 FROM %s.ratings WHERE recipe_id = $1 ORDER BY created_at DESC`, schemaName), recipeID)
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

// CreateRating inserts a new rating record into Amazon Aurora DSQL with a generated UUID.
func (s *DSQLStore) CreateRating(ctx context.Context, recipeID string, input model.CreateRatingInput) (*model.Rating, error) {
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

	_, err := s.pool.Exec(ctx,
		fmt.Sprintf(`INSERT INTO %s.ratings (id, recipe_id, chef_id, score, comment, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`, schemaName),
		r.ID, r.RecipeID, r.ChefID, r.Score, r.Comment, r.CreatedAt, r.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create rating: %w", err)
	}
	return &r, nil
}
