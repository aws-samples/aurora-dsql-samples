// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package handler

import (
	"log"
	"net/http"
	"slices"

	"github.com/aws-samples/recipe-share-dsql-go/internal/model"
	"github.com/aws-samples/recipe-share-dsql-go/internal/store"
	"github.com/gin-gonic/gin"
)

// RecipeHandler holds the store dependency for recipe route handlers.
type RecipeHandler struct {
	Store store.Store
}

// List returns recipes, optionally filtered by cuisine, difficulty, or status.
func (h *RecipeHandler) List(c *gin.Context) {
	filter := model.RecipeFilter{
		Cuisine:    c.Query("cuisine"),
		Difficulty: c.Query("difficulty"),
		Status:     c.Query("status"),
	}

	// Validate filter values when provided.
	if filter.Difficulty != "" && !slices.Contains(model.ValidDifficulties, filter.Difficulty) {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "difficulty must be one of: easy, medium, hard"},
		})
		return
	}
	if filter.Status != "" && !slices.Contains(model.ValidStatuses, filter.Status) {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "status must be one of: draft, published, archived"},
		})
		return
	}

	recipes, err := h.Store.ListRecipes(c.Request.Context(), filter)
	if err != nil {
		log.Printf("ERROR failed to list recipes: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to list recipes"},
		})
		return
	}
	if recipes == nil {
		recipes = []model.Recipe{}
	}
	c.JSON(http.StatusOK, model.ListResponse{Data: recipes, Count: len(recipes)})
}

// Get returns a single recipe by ID, including its ratings and average score.
func (h *RecipeHandler) Get(c *gin.Context) {
	id := c.Param("id")
	recipe, err := h.Store.GetRecipeWithRatings(c.Request.Context(), id)
	if err != nil {
		log.Printf("ERROR failed to get recipe: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to get recipe"},
		})
		return
	}
	if recipe == nil {
		c.JSON(http.StatusNotFound, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "NOT_FOUND", Message: "recipe not found"},
		})
		return
	}
	c.JSON(http.StatusOK, model.SuccessResponse{Data: recipe})
}

// Create adds a new recipe after verifying the referenced chef exists.
func (h *RecipeHandler) Create(c *gin.Context) {
	var input model.CreateRecipeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "invalid request body"},
		})
		return
	}

	// Validate difficulty and status values.
	if input.Difficulty != "" && !slices.Contains(model.ValidDifficulties, input.Difficulty) {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "difficulty must be one of: easy, medium, hard"},
		})
		return
	}
	if input.Status != "" && !slices.Contains(model.ValidStatuses, input.Status) {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "status must be one of: draft, published, archived"},
		})
		return
	}

	// Enforce referential integrity: verify the chef exists.
	chef, err := h.Store.GetChef(c.Request.Context(), input.ChefID)
	if err != nil {
		log.Printf("ERROR failed to verify chef: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to verify chef"},
		})
		return
	}
	if chef == nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "chef_id references a chef that does not exist"},
		})
		return
	}

	recipe, err := h.Store.CreateRecipe(c.Request.Context(), input)
	if err != nil {
		log.Printf("ERROR failed to create recipe: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to create recipe"},
		})
		return
	}
	c.JSON(http.StatusCreated, model.SuccessResponse{Data: recipe})
}

// Update modifies an existing recipe.
func (h *RecipeHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var input model.UpdateRecipeInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "invalid request body"},
		})
		return
	}

	if input.Difficulty != nil && !slices.Contains(model.ValidDifficulties, *input.Difficulty) {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "difficulty must be one of: easy, medium, hard"},
		})
		return
	}
	if input.Status != nil && !slices.Contains(model.ValidStatuses, *input.Status) {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "status must be one of: draft, published, archived"},
		})
		return
	}

	recipe, err := h.Store.UpdateRecipe(c.Request.Context(), id, input)
	if err != nil {
		log.Printf("ERROR failed to update recipe: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to update recipe"},
		})
		return
	}
	if recipe == nil {
		c.JSON(http.StatusNotFound, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "NOT_FOUND", Message: "recipe not found"},
		})
		return
	}
	c.JSON(http.StatusOK, model.SuccessResponse{Data: recipe})
}

// Delete removes a recipe by ID.
func (h *RecipeHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	recipe, err := h.Store.GetRecipe(c.Request.Context(), id)
	if err != nil {
		log.Printf("ERROR failed to delete recipe: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to delete recipe"},
		})
		return
	}
	if recipe == nil {
		c.JSON(http.StatusNotFound, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "NOT_FOUND", Message: "recipe not found"},
		})
		return
	}

	if err := h.Store.DeleteRecipe(c.Request.Context(), id); err != nil {
		log.Printf("ERROR failed to delete recipe: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to delete recipe"},
		})
		return
	}
	c.JSON(http.StatusOK, model.SuccessResponse{Data: gin.H{"deleted": true}})
}
