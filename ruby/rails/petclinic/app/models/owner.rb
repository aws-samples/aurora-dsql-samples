class Owner < ApplicationRecord
  has_many :pets, dependent: :destroy
  has_one :vet

  validates :name, presence: true, length: { maximum: 30 }
  validates :city, presence: true, length: { maximum: 80 }
  validates :telephone, presence: false, length: { maximum: 20 }

  # Without this, active record uses all the the columns that are
  # part of the primary key index. Unlike postgres, by default,
  # Aurora DSQL creates primary key index including all columns in 
  # the table.
  self.primary_key = "id"
end
