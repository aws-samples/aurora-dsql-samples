# frozen_string_literal: true

require "test_helper"

class VehicleTest < ActiveSupport::TestCase
  def build_vehicle(overrides = {})
    {
      make: "Toyota",
      model: "Camry",
      year: 2023,
      license_plate: "TEST-#{SecureRandom.hex(4).upcase}",
      daily_rate: 49.99,
      status: "available",
      mileage: 15_000
    }.merge(overrides)
  end

  test "creates a valid vehicle" do
    vehicle = Vehicle.create!(build_vehicle)
    assert vehicle.persisted?
    vehicle.destroy!
  end

  test "requires make and model" do
    vehicle = Vehicle.new(build_vehicle(make: nil, model: nil))
    assert_not vehicle.valid?
    assert_includes vehicle.errors[:make], "can't be blank"
    assert_includes vehicle.errors[:model], "can't be blank"
  end

  test "requires daily_rate greater than zero" do
    vehicle = Vehicle.new(build_vehicle(daily_rate: -5))
    assert_not vehicle.valid?
    assert_includes vehicle.errors[:daily_rate], "must be greater than 0"
  end

  test "validates status inclusion" do
    vehicle = Vehicle.new(build_vehicle(status: "destroyed"))
    assert_not vehicle.valid?
    assert_includes vehicle.errors[:status], "is not included in the list"
  end
end
