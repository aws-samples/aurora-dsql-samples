class Vet < ApplicationRecord
  has_one :owner

  validates :name, presence: true, length: { maximum: 30 }

  # Without this, active record uses all the the columns that are
  # part of the primary key index. Unlike postgres, by default,
  # Aurora DSQL creates primary key index including all columns in 
  # the table.
  self.primary_key = "id"
end
