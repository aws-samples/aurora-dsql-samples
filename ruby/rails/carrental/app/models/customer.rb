# frozen_string_literal: true

# Represents a customer who can make vehicle rental reservations.
#
# Aurora DSQL creates primary key indexes that include all columns by default,
# so we must explicitly set the primary key to "id" to ensure Active Record
# queries use only the UUID primary key column.
#
# Relationships:
#   - A customer can have many reservations (one-to-many)
#
# Note: Foreign key constraints are not supported by Aurora DSQL.
# Referential integrity is enforced at the application layer.
class Customer < ApplicationRecord
  # Explicitly set primary key for Aurora DSQL compatibility.
  self.primary_key = "id"

  # ---------------------------------------------------------------------------
  # Associations
  # ---------------------------------------------------------------------------
  has_many :reservations, dependent: :restrict_with_error

  # ---------------------------------------------------------------------------
  # Validations
  # ---------------------------------------------------------------------------
  validates :name, presence: true, length: { maximum: 100 }
  validates :email, presence: true, length: { maximum: 255 }
  validates :license_number, presence: true, length: { maximum: 50 }
  validates :phone, length: { maximum: 20 }, allow_blank: true
end
