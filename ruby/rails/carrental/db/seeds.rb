# frozen_string_literal: true

# =============================================================================
# Database Seeds for the Car Rental Application
# =============================================================================
#
# This file creates sample data to demonstrate the application. It is
# idempotent — running it multiple times will not create duplicate records
# (uses find_or_create_by! where appropriate).
#
# Usage:
#   bin/rails db:seed
#
# Or as part of database setup:
#   bin/rails db:prepare  (runs migrations + seeds if needed)
# =============================================================================

puts "Seeding database..."

# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------
vehicles_data = [
  { make: "Toyota", model: "Camry", year: 2024, color: "Silver", license_plate: "ABC-1234", daily_rate: 45.00, status: "available", mileage: 12_500 },
  { make: "Honda", model: "Civic", year: 2023, color: "Blue", license_plate: "DEF-5678", daily_rate: 40.00, status: "available", mileage: 18_200 },
  { make: "Ford", model: "Mustang", year: 2024, color: "Red", license_plate: "GHI-9012", daily_rate: 75.00, status: "available", mileage: 5_800 },
  { make: "Chevrolet", model: "Equinox", year: 2023, color: "White", license_plate: "JKL-3456", daily_rate: 55.00, status: "available", mileage: 22_100 },
  { make: "Tesla", model: "Model 3", year: 2024, color: "Black", license_plate: "MNO-7890", daily_rate: 85.00, status: "maintenance", mileage: 8_400 }
]

vehicles = vehicles_data.map do |attrs|
  Vehicle.find_or_create_by!(license_plate: attrs[:license_plate]) do |v|
    v.assign_attributes(attrs)
  end
end

puts "  Created #{vehicles.size} vehicles"

# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
customers_data = [
  { name: "Jane Smith", email: "jane.smith@example.com", phone: "555-0101", license_number: "DL-2024-001" },
  { name: "John Doe", email: "john.doe@example.com", phone: "555-0102", license_number: "DL-2024-002" },
  { name: "Maria Garcia", email: "maria.garcia@example.com", phone: "555-0103", license_number: "DL-2024-003" }
]

customers = customers_data.map do |attrs|
  Customer.find_or_create_by!(email: attrs[:email]) do |c|
    c.assign_attributes(attrs)
  end
end

puts "  Created #{customers.size} customers"

# ---------------------------------------------------------------------------
# Reservations
# ---------------------------------------------------------------------------
reservations_data = [
  { customer: customers[0], vehicle: vehicles[0], start_date: Date.today + 1, end_date: Date.today + 4, status: "pending" },
  { customer: customers[1], vehicle: vehicles[2], start_date: Date.today + 2, end_date: Date.today + 5, status: "pending" },
  { customer: customers[2], vehicle: vehicles[3], start_date: Date.today - 2, end_date: Date.today + 1, status: "active" }
]

# Only create reservations if none exist yet (reservations lack a natural
# unique key, so we guard with a simple existence check).
if Reservation.none?
  reservations_data.each { |attrs| Reservation.create!(attrs) }
  puts "  Created #{reservations_data.size} reservations"
else
  puts "  Reservations already exist — skipping"
end

puts "Seeding complete!"
