class Specialty < ApplicationRecord
  has_many :vet_specialties
  has_many :vets, through: :vet_specialties

  validates :name, presence: true, length: { maximum: 80 }

  # Without this, active record uses all the the columns that are
  # part of the primary key index. Unlike postgres, by default,
  # Aurora DSQL creates primary key index including all columns in
  # the table.
  self.primary_key = "id"
end
