# frozen_string_literal: true

require "test_helper"

class ReservationTest < ActiveSupport::TestCase
  setup do
    @vehicle = Vehicle.create!(
      make: "Honda", model: "Civic", year: 2023,
      license_plate: "RES-#{SecureRandom.hex(4).upcase}",
      daily_rate: 39.99, status: "available", mileage: 10_000
    )
    @customer = Customer.create!(
      name: "Test User",
      email: "test.#{SecureRandom.hex(4)}@example.com",
      license_number: "DL-#{SecureRandom.hex(4).upcase}"
    )
  end

  teardown do
    Reservation.where(vehicle_id: @vehicle.id).destroy_all
    @customer&.destroy
    @vehicle&.destroy
  end

  test "creates a valid reservation" do
    reservation = Reservation.create!(
      vehicle: @vehicle, customer: @customer,
      start_date: Date.today, end_date: Date.today + 3,
      status: "pending"
    )
    assert reservation.persisted?
    reservation.destroy!
  end

  test "database rejects a reservation with missing parents" do
    error = assert_raises(ActiveRecord::InvalidForeignKey) do
      Reservation.insert_all!([
        {
          id: SecureRandom.uuid,
          customer_id: SecureRandom.uuid,
          vehicle_id: SecureRandom.uuid,
          start_date: Date.today,
          end_date: Date.today + 1,
          status: "pending",
          created_at: Time.current,
          updated_at: Time.current
        }
      ])
    end

    assert_match(/foreign key/i, error.message)
  end

  test "requires start_date and end_date" do
    reservation = Reservation.new(
      vehicle: @vehicle, customer: @customer,
      start_date: nil, end_date: nil, status: "pending"
    )
    assert_not reservation.valid?
    assert_includes reservation.errors[:start_date], "can't be blank"
    assert_includes reservation.errors[:end_date], "can't be blank"
  end

  test "end_date must be after start_date" do
    reservation = Reservation.new(
      vehicle: @vehicle, customer: @customer,
      start_date: Date.today, end_date: Date.today - 1,
      status: "pending"
    )
    assert_not reservation.valid?
  end

  test "validates status inclusion" do
    reservation = Reservation.new(
      vehicle: @vehicle, customer: @customer,
      start_date: Date.today, end_date: Date.today + 3,
      status: "invalid"
    )
    assert_not reservation.valid?
    assert_includes reservation.errors[:status], "is not included in the list"
  end
end
