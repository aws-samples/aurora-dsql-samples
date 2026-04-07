# frozen_string_literal: true

# Represents a vehicle available for rental in the car rental fleet.
#
# Aurora DSQL creates primary key indexes that include all columns by default,
# so we must explicitly set the primary key to "id" to ensure Active Record
# queries use only the UUID primary key column.
#
# Relationships:
#   - A vehicle can have many reservations (one-to-many)
#
# Note: Foreign key constraints are not supported by Aurora DSQL.
# Referential integrity is enforced at the application layer.
class Vehicle < ApplicationRecord
  # Explicitly set primary key for Aurora DSQL compatibility.
  # DSQL's primary key index includes all columns; this ensures
  # Active Record uses only the id column for lookups.
  self.primary_key = "id"

  # ---------------------------------------------------------------------------
  # Associations
  # ---------------------------------------------------------------------------
  has_many :reservations, dependent: :restrict_with_error

  # ---------------------------------------------------------------------------
  # Validations
  # ---------------------------------------------------------------------------
  validates :make, presence: true, length: { maximum: 50 }
  validates :model, presence: true, length: { maximum: 50 }
  validates :year, presence: true,
            numericality: { only_integer: true, greater_than: 1900, less_than_or_equal_to: 2030 }
  validates :license_plate, presence: true, length: { maximum: 20 }
  validates :daily_rate, presence: true, numericality: { greater_than: 0 }
  validates :status, presence: true, inclusion: { in: %w[available rented maintenance] }
  validates :mileage, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true

  # ---------------------------------------------------------------------------
  # Scopes
  # ---------------------------------------------------------------------------

  # Returns only vehicles that are currently available for rental.
  scope :available, -> { where(status: "available") }

  # ---------------------------------------------------------------------------
  # Instance Methods
  # ---------------------------------------------------------------------------

  # Returns a human-readable display name for the vehicle.
  #
  # @return [String] e.g., "2024 Toyota Camry"
  def display_name
    "#{year} #{make} #{model}"
  end
end
