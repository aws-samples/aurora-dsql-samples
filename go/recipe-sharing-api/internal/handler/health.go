// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Health returns a simple health check response for load balancer probes.
func Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
