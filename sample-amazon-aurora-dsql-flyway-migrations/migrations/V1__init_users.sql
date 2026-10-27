-- V1__init_users.sql
-- First migration: create the users table.
-- Aurora DSQL requires each DDL statement in its own transaction, so this
-- migration contains exactly one CREATE TABLE. Keep it that way.

CREATE TABLE IF NOT EXISTS users (
  id         UUID         PRIMARY KEY,
  email      VARCHAR(254) NOT NULL,
  name       VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);
