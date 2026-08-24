require "test_helper"

class OwnerTest < ActiveSupport::TestCase
  test "upsert updates non-primary-key columns" do
    owner = owners(:one)

    Owner.upsert_all([owner.attributes.merge("name" => "Updated Name")])

    assert_equal "Updated Name", owner.reload.name
  end
end
