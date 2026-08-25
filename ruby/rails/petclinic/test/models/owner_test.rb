require "test_helper"

class OwnerTest < ActiveSupport::TestCase
  test "upsert updates non-primary-key columns" do
    owner = Owner.create!(name: "Original Name", city: "Seattle")

    Owner.upsert_all([owner.attributes.merge("name" => "Updated Name")])

    assert_equal "Updated Name", owner.reload.name
  ensure
    owner&.destroy!
  end
end
