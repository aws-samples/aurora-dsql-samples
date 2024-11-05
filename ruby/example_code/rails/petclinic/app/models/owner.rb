class Owner < ApplicationRecord
  has_many :pets, dependent: :destroy

  validates :name, presence: true, length: { maximum: 30 }
  validates :city, presence: true, length: { maximum: 80 }
  validates :telephone, presence: false, length: { maximum: 20 }
end
