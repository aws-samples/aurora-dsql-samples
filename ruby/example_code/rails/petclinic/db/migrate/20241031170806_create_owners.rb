class CreateOwners < ActiveRecord::Migration[7.2]
  def change
    create_table :owners, id: :uuid do |t|
      t.string :name, limit: 30
      t.string :city, limit: 80
      t.string :telephone, limit: 20

      t.timestamps
    end
  end
end
