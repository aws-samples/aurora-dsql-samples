// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package handler

import (
	"log"
	"net/http"

	"github.com/aws-samples/recipe-share-dsql-go/internal/model"
	"github.com/aws-samples/recipe-share-dsql-go/internal/store"
	"github.com/gin-gonic/gin"
)

// RatingHandler holds the store dependency for rating route handlers.
type RatingHandler struct {
	Store store.Store
}

// List returns all ratings for a given recipe.
func (h *RatingHandler) List(c *gin.Context) {
	recipeID := c.Param("id")

	// Verify the recipe exists.
	recipe, err := h.Store.GetRecipe(c.Request.Context(), recipeID)
	if err != nil {
		log.Printf("ERROR failed to verify recipe: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to verify recipe"},
		})
		return
	}
	if recipe == nil {
		c.JSON(http.StatusNotFound, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "NOT_FOUND", Message: "recipe not found"},
		})
		return
	}

	ratings, err := h.Store.ListRatings(c.Request.Context(), recipeID)
	if err != nil {
		log.Printf("ERROR failed to list ratings: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to list ratings"},
		})
		return
	}
	if ratings == nil {
		ratings = []model.Rating{}
	}
	c.JSON(http.StatusOK, model.ListResponse{Data: ratings, Count: len(ratings)})
}

// Create adds a new rating to a recipe after verifying both the recipe and
// the rating chef exist. This enforces referential integrity at the
// application layer since Amazon Aurora DSQL does not support foreign keys.
func (h *RatingHandler) Create(c *gin.Context) {
	recipeID := c.Param("id")

	var input model.CreateRatingInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "invalid request body"},
		})
		return
	}

	// Enforce referential integrity: verify the recipe exists.
	recipe, err := h.Store.GetRecipe(c.Request.Context(), recipeID)
	if err != nil {
		log.Printf("ERROR failed to verify recipe: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to verify recipe"},
		})
		return
	}
	if recipe == nil {
		c.JSON(http.StatusNotFound, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "NOT_FOUND", Message: "recipe not found"},
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

	rating, err := h.Store.CreateRating(c.Request.Context(), recipeID, input)
	if err != nil {
		log.Printf("ERROR failed to create rating: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to create rating"},
		})
		return
	}
	c.JSON(http.StatusCreated, model.SuccessResponse{Data: rating})
}
