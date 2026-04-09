# frozen_string_literal: true

require "test_helper"

class CustomerTest < ActiveSupport::TestCase
  def build_customer(overrides = {})
    {
      name: "Jane Doe",
      email: "jane.#{SecureRandom.hex(4)}@example.com",
      license_number: "DL-#{SecureRandom.hex(4).upcase}",
      phone: "555-0100"
    }.merge(overrides)
  end

  test "creates a valid customer" do
    customer = Customer.create!(build_customer)
    assert customer.persisted?
    customer.destroy!
  end

  test "requires name and email" do
    customer = Customer.new(build_customer(name: nil, email: nil))
    assert_not customer.valid?
    assert_includes customer.errors[:name], "can't be blank"
    assert_includes customer.errors[:email], "can't be blank"
  end

  test "requires license_number" do
    customer = Customer.new(build_customer(license_number: nil))
    assert_not customer.valid?
    assert_includes customer.errors[:license_number], "can't be blank"
  end

  test "phone is optional" do
    customer = Customer.new(build_customer(phone: nil))
    assert customer.valid?
  end
end
