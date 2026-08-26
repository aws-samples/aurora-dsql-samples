// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

package store

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// IsForeignKeyViolation reports whether err contains PostgreSQL SQLSTATE 23503.
func IsForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}
