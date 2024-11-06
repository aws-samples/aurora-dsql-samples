class Pet < ApplicationRecord
  belongs_to :owner

  validates :name, presence: true, length: { maximum: 30 }
  validates :birth_date, presence: true

  # Without this, active record uses all the the columns that are
  # part of the primary key index. Unlike postgres, by default,
  # Aurora DSQL creates primary key index including all columns in 
  # the table.
  self.primary_key = "id"
end
