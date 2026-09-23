// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package store

import (
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestIsForeignKeyViolation(t *testing.T) {
	t.Run("wrapped foreign key violation", func(t *testing.T) {
		err := fmt.Errorf("create rating: %w", &pgconn.PgError{Code: "23503"})
		if !IsForeignKeyViolation(err) {
			t.Fatal("expected SQLSTATE 23503 to be recognized")
		}
	})

	t.Run("different database error", func(t *testing.T) {
		err := &pgconn.PgError{Code: "23505"}
		if IsForeignKeyViolation(err) {
			t.Fatal("did not expect SQLSTATE 23505 to be recognized")
		}
	})
}
