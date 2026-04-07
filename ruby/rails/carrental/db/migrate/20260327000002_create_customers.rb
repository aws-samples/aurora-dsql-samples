# frozen_string_literal: true

class CreateCustomers < ActiveRecord::Migration[7.2]
  def change
    create_table :customers, id: :string do |t|
      t.string :name, limit: 100, null: false
      t.string :email, limit: 255, null: false
      t.string :phone, limit: 20
      t.string :license_number, limit: 50, null: false

      t.timestamps
    end
  end
end
