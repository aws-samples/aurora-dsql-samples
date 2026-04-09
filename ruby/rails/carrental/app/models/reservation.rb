# frozen_string_literal: true

# Represents a vehicle rental reservation linking a customer to a vehicle
# for a specific date range.
#
# Aurora DSQL creates primary key indexes that include all columns by default,
# so we must explicitly set the primary key to "id" to ensure Active Record
# queries use only the UUID primary key column.
#
# Relationships:
#   - A reservation belongs to one customer (many-to-one)
#   - A reservation belongs to one vehicle (many-to-one)
#
# Note: Foreign key constraints are not supported by Aurora DSQL.
# Referential integrity is enforced at the application layer through
# Active Record associations and validations.
class Reservation < ApplicationRecord
  # Explicitly set primary key for Aurora DSQL compatibility.
  self.primary_key = "id"

  # ---------------------------------------------------------------------------
  # Associations
  # ---------------------------------------------------------------------------
  belongs_to :customer
  belongs_to :vehicle

  # ---------------------------------------------------------------------------
  # Validations
  # ---------------------------------------------------------------------------
  validates :customer_id, presence: true
  validates :vehicle_id, presence: true
  validates :start_date, presence: true
  validates :end_date, presence: true
  validates :status, presence: true, inclusion: { in: %w[pending active completed cancelled] }
  validate :end_date_after_start_date
  validate :vehicle_not_in_maintenance

  # ---------------------------------------------------------------------------
  # Callbacks
  # ---------------------------------------------------------------------------

  # Automatically calculate the total price based on the rental duration
  # and the vehicle's daily rate before saving.
  before_save :calculate_total_price

  # Update the vehicle's status based on reservation changes.
  after_save :update_vehicle_status
  after_destroy :release_vehicle_if_available

  # Prevent deletion of active reservations.
  before_destroy :prevent_active_deletion

  # ---------------------------------------------------------------------------
  # Scopes
  # ---------------------------------------------------------------------------

  # Returns only reservations with an "active" status.
  scope :active, -> { where(status: "active") }

  # Returns only reservations with a "pending" status.
  scope :pending, -> { where(status: "pending") }

  private

  # Prevents deletion of reservations with an "active" status.
  # Active reservations must be completed or cancelled before they can be removed.
  def prevent_active_deletion
    if status == "active"
      errors.add(:base, "Cannot delete an active reservation. Please cancel or complete it first.")
      throw(:abort)
    end
  end

  # Validates that the vehicle is not in maintenance status.
  # Vehicles under maintenance cannot be rented.
  def vehicle_not_in_maintenance
    return if vehicle.blank?

    if vehicle.status == "maintenance"
      errors.add(:vehicle, "is currently under maintenance and cannot be rented")
    end
  end

  # Validates that the end date is after the start date.
  # A reservation must span at least one day.
  def end_date_after_start_date
    return if start_date.blank? || end_date.blank?

    errors.add(:end_date, "must be after start date") if end_date <= start_date
  end

  # Calculates the total rental price based on the number of days
  # and the vehicle's daily rate.
  #
  # Formula: total_price = (end_date - start_date) * vehicle.daily_rate
  def calculate_total_price
    return if start_date.blank? || end_date.blank? || vehicle.blank?

    days = (end_date - start_date).to_i
    self.total_price = days * vehicle.daily_rate
  end

  # Updates the vehicle's status after a reservation is saved.
  #
  # - If the reservation is pending or active, the vehicle is marked as "rented".
  # - If the reservation is completed or cancelled, the vehicle is released
  #   back to "available" (only if no other pending/active reservations exist).
  # - If the vehicle was changed, the previous vehicle is also checked and
  #   released if it has no remaining pending/active reservations.
  def update_vehicle_status
    # Release the previous vehicle if the vehicle was changed
    if saved_change_to_vehicle_id? && vehicle_id_before_last_save.present?
      previous_vehicle = Vehicle.find_by(id: vehicle_id_before_last_save)
      release_vehicle(previous_vehicle) if previous_vehicle
    end

    return unless vehicle

    if %w[pending active].include?(status)
      vehicle.update_column(:status, "rented") unless vehicle.status == "rented"
    else
      release_vehicle(vehicle)
    end
  end

  # After a reservation is destroyed, check if the vehicle should be
  # set back to "available".
  def release_vehicle_if_available
    release_vehicle(vehicle) if vehicle
  end

  # Sets a vehicle's status to "available" if it has no other
  # pending or active reservations.
  def release_vehicle(v)
    has_active_reservations = v.reservations
      .where(status: %w[pending active])
      .where.not(id: id)
      .exists?

    v.update_column(:status, "available") unless has_active_reservations
  end
end
