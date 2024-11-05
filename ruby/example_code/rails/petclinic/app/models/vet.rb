class Vet < ApplicationRecord
  has_one :owner

  validates :name, presence: true, length: { maximum: 30 }
end
