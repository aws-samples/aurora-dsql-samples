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

// ChefHandler holds the store dependency for chef route handlers.
type ChefHandler struct {
	Store store.Store
}

// List returns all chefs.
func (h *ChefHandler) List(c *gin.Context) {
	chefs, err := h.Store.ListChefs(c.Request.Context())
	if err != nil {
		log.Printf("ERROR list chefs: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to list chefs"},
		})
		return
	}
	if chefs == nil {
		chefs = []model.Chef{}
	}
	c.JSON(http.StatusOK, model.ListResponse{Data: chefs, Count: len(chefs)})
}

// Get returns a single chef by ID, including their recipes.
func (h *ChefHandler) Get(c *gin.Context) {
	id := c.Param("id")
	chef, err := h.Store.GetChefWithRecipes(c.Request.Context(), id)
	if err != nil {
		log.Printf("ERROR get chef %s: %v", id, err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to get chef"},
		})
		return
	}
	if chef == nil {
		c.JSON(http.StatusNotFound, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "NOT_FOUND", Message: "chef not found"},
		})
		return
	}
	c.JSON(http.StatusOK, model.SuccessResponse{Data: chef})
}

// Create adds a new chef.
func (h *ChefHandler) Create(c *gin.Context) {
	var input model.CreateChefInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "invalid request body"},
		})
		return
	}

	chef, err := h.Store.CreateChef(c.Request.Context(), input)
	if err != nil {
		log.Printf("ERROR create chef: %v", err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to create chef"},
		})
		return
	}
	c.JSON(http.StatusCreated, model.SuccessResponse{Data: chef})
}

// Update modifies an existing chef.
func (h *ChefHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var input model.UpdateChefInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "invalid request body"},
		})
		return
	}

	chef, err := h.Store.UpdateChef(c.Request.Context(), id, input)
	if err != nil {
		log.Printf("ERROR update chef %s: %v", id, err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to update chef"},
		})
		return
	}
	if chef == nil {
		c.JSON(http.StatusNotFound, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "NOT_FOUND", Message: "chef not found"},
		})
		return
	}
	c.JSON(http.StatusOK, model.SuccessResponse{Data: chef})
}

// Delete removes a chef by ID.
func (h *ChefHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	// Verify the chef exists before deleting.
	chef, err := h.Store.GetChef(c.Request.Context(), id)
	if err != nil {
		log.Printf("ERROR delete chef %s: %v", id, err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to delete chef"},
		})
		return
	}
	if chef == nil {
		c.JSON(http.StatusNotFound, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "NOT_FOUND", Message: "chef not found"},
		})
		return
	}

	if err := h.Store.DeleteChef(c.Request.Context(), id); err != nil {
		log.Printf("ERROR delete chef %s: %v", id, err)
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to delete chef"},
		})
		return
	}
	c.JSON(http.StatusOK, model.SuccessResponse{Data: gin.H{"deleted": true}})
}
