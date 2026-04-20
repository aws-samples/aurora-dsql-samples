// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package model

// SuccessResponse wraps a single resource in a standard JSON envelope.
type SuccessResponse struct {
	Data any `json:"data"`
}

// ListResponse wraps a collection of resources with a count.
type ListResponse struct {
	Data  any `json:"data"`
	Count int `json:"count"`
}

// ErrorDetail holds the code and message for an API error.
type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ErrorResponse wraps an error in a standard JSON envelope.
type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}
