# frozen_string_literal: true

require "test_helper"

class ForeignKeyDeleteTest < ActionDispatch::IntegrationTest
  setup do
    @vehicle = Vehicle.create!(
      make: "Honda", model: "Civic", year: 2023,
      license_plate: "DELETE-#{SecureRandom.hex(4).upcase}",
      daily_rate: 39.99, status: "available", mileage: 10_000
    )
    @customer = Customer.create!(
      name: "Delete Test",
      email: "delete.#{SecureRandom.hex(4)}@example.com",
      license_number: "DL-#{SecureRandom.hex(4).upcase}"
    )
    Reservation.create!(
      vehicle: @vehicle, customer: @customer,
      start_date: Date.today, end_date: Date.today + 3,
      status: "pending"
    )
  end

  teardown do
    Reservation.delete_all
    Customer.delete_all
    Vehicle.delete_all
  end

  test "deleting a referenced customer reports the database conflict" do
    delete customer_url(@customer)

    assert_redirected_to customer_url(@customer)
    assert_equal "Cannot delete customer with reservations.", flash[:alert]
  end

  test "deleting a referenced vehicle reports the database conflict" do
    delete vehicle_url(@vehicle)

    assert_redirected_to vehicle_url(@vehicle)
    assert_equal "Cannot delete vehicle with reservations.", flash[:alert]
  end
end
