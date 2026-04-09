// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package router

import (
	"github.com/aws-samples/recipe-share-dsql-go/internal/handler"
	"github.com/aws-samples/recipe-share-dsql-go/internal/middleware"
	"github.com/aws-samples/recipe-share-dsql-go/internal/store"
	"github.com/gin-gonic/gin"
)

// New creates a Gin engine with middleware and all API routes registered.
// The store parameter allows the router to work with either the SQLite
// store (local development) or the Amazon Aurora DSQL store (production).
func New(s store.Store) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.RequestLogger())
	r.Use(middleware.CORS())

	// Health check endpoint for Amazon API Gateway or load balancer probes.
	r.GET("/health", handler.Health)

	// API v1 route group.
	v1 := r.Group("/api/v1")

	chefH := &handler.ChefHandler{Store: s}
	v1.GET("/chefs", chefH.List)
	v1.POST("/chefs", chefH.Create)
	v1.GET("/chefs/:id", chefH.Get)
	v1.PUT("/chefs/:id", chefH.Update)
	v1.DELETE("/chefs/:id", chefH.Delete)

	recipeH := &handler.RecipeHandler{Store: s}
	v1.GET("/recipes", recipeH.List)
	v1.POST("/recipes", recipeH.Create)
	v1.GET("/recipes/:id", recipeH.Get)
	v1.PUT("/recipes/:id", recipeH.Update)
	v1.DELETE("/recipes/:id", recipeH.Delete)

	ratingH := &handler.RatingHandler{Store: s}
	v1.GET("/recipes/:id/ratings", ratingH.List)
	v1.POST("/recipes/:id/ratings", ratingH.Create)

	return r
}
